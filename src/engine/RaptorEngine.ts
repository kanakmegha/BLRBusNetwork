import type { DataManager } from "./data_manager";
import type { PathResult, RaptorLabel, Stop, StopTime, Trip } from "./types";
import { FareCalculator } from "./fare_calculator";
import { haversine } from "../utils/geo";

export class RaptorEngine {
    private data: DataManager;

    constructor(dataManager: DataManager) {
        this.data = dataManager;
    }

    async findRoute(
        startStopId: string,
        destinationStopId: string,
        startTimeStr: string, // HH:MM:SS or HH:MM
        maxRounds: number = 3,
    ): Promise<PathResult[]> {
        const startTime = this.timeToSeconds(startTimeStr);
        const stops = this.data.getAllStops();
        const numStops = stops.length;
        
        // Map stop_id to numeric index for flat array
        const stopToIndex = new Map<string, number>();
        stops.forEach((s, i) => stopToIndex.set(s.stop_id, i));

        // Use flat Float64Array for arrival times: [round][stop]
        // size: (maxRounds + 1) * numStops
        const arrivalTimes = new Float64Array((maxRounds + 1) * numStops).fill(Infinity);
        
        // Store preceding info only for reachable stops to save memory/initialization time
        const precedingStops = new Int32Array((maxRounds + 1) * numStops).fill(-1);
        const precedingTrips = new Map<number, string>(); // index in flat array -> tripId
        const precedingRoutes = new Map<number, string>(); // index in flat array -> routeId
        const isWalking = new Uint8Array((maxRounds + 1) * numStops).fill(0);

        const getFlatIdx = (k: number, sIdx: number) => k * numStops + sIdx;

        // Set start point
        const startIdx = stopToIndex.get(startStopId)!;
        arrivalTimes[getFlatIdx(0, startIdx)] = startTime;
        let markedStops = new Set<string>([startStopId]);
        let bestTargetArrival = Infinity;
        const targetIdx = stopToIndex.get(destinationStopId)!;

        const initialNearby = this.data.findNearbyStops(startStopId, 500);
        initialNearby.forEach((ns: Stop & { distance: number }) => {
            const walkTime = Math.floor(ns.distance / 1.1); // ~4km/h
            const nsIdx = stopToIndex.get(ns.stop_id)!;
            const flatIdx = getFlatIdx(0, nsIdx);
            
            if (startTime + walkTime < arrivalTimes[flatIdx]) {
                arrivalTimes[flatIdx] = startTime + walkTime;
                precedingStops[flatIdx] = startIdx;
                precedingTrips.set(flatIdx, "WALKING");
                precedingRoutes.set(flatIdx, "WALKING");
                isWalking[flatIdx] = 1;
                markedStops.add(ns.stop_id);
            }
        });

        // Pre-cache route stop indices for faster lookup
        const routeStopIndices = new Map<string, Map<string, number>>();

        for (let k = 1; k <= maxRounds; k++) {
            const queue = new Map<string, string>(); // RouteID -> First marked stop in sequence

            markedStops.forEach((sid: string) => {
                const routes = this.data.getRoutesForStop(sid);
                routes.forEach((rid: string) => {
                    const route = this.data.getRoute(rid)!;
                    
                    if (!routeStopIndices.has(rid)) {
                        const indices = new Map<string, number>();
                        route.stops.forEach((s: string, idx: number) => indices.set(s, idx));
                        routeStopIndices.set(rid, indices);
                    }
                    
                    const stopIdx = routeStopIndices.get(rid)!.get(sid)!;
                    if (
                        !queue.has(rid) ||
                        routeStopIndices.get(rid)!.get(queue.get(rid)!)! > stopIdx
                    ) {
                        queue.set(rid, sid);
                    }
                });
            });

            markedStops.clear();

            // Parallelize trip fetching for all routes in the queue using batched method
            const routeIds = Array.from(queue.keys());
            const routeTripsMap = await this.data.getTripsForRoutes(routeIds);

            for (const [routeId, boardingStopId] of queue) {
                const route = this.data.getRoute(routeId)!;
                const trips = routeTripsMap.get(routeId) || [];
                let currentTrip: (Trip & { boardingStop: string }) | null =
                    null;

                const startIdxInRoute = routeStopIndices.get(routeId)!.get(boardingStopId)!;

                for (let i = startIdxInRoute; i < route.stops.length; i++) {
                    const sid = route.stops[i];
                    const sIdx = stopToIndex.get(sid)!;
                    const flatIdxK = getFlatIdx(k, sIdx);

                    if (currentTrip) {
                        const st: StopTime = currentTrip.stopTimes[i];
                        if (st && st.stopId === sid) {
                            const arrival = this.timeToSeconds(st.arrival);
                            
                            // Optimized: only check against best arrival in previous rounds
                            let bestArrivalSoFar = arrivalTimes[getFlatIdx(k - 1, sIdx)];
                            if (arrivalTimes[flatIdxK] < bestArrivalSoFar) bestArrivalSoFar = arrivalTimes[flatIdxK];

                            if (arrival < bestTargetArrival && arrival < bestArrivalSoFar) {
                                arrivalTimes[flatIdxK] = arrival;
                                precedingStops[flatIdxK] = stopToIndex.get(currentTrip.boardingStop)!;
                                precedingTrips.set(flatIdxK, currentTrip.tripId);
                                precedingRoutes.set(flatIdxK, routeId);
                                isWalking[flatIdxK] = 0;
                                markedStops.add(sid);
                                
                                if (sIdx === targetIdx) {
                                    bestTargetArrival = Math.min(bestTargetArrival, arrival);
                                }
                            }
                        }
                    }

                    const prevArrival = arrivalTimes[getFlatIdx(k - 1, sIdx)];
                    if (prevArrival !== Infinity && prevArrival < bestTargetArrival) {
                        const trip = this.findEarliestTrip(
                            trips,
                            i,
                            prevArrival + 60,
                        );
                        if (trip) {
                            const st = trip.stopTimes[i]!;
                            const stopDepTime = this.timeToSeconds(
                                st.departure,
                            );
                            if (
                                !currentTrip ||
                                stopDepTime <
                                    this.timeToSeconds(
                                        currentTrip.stopTimes[i].departure,
                                    )
                            ) {
                                currentTrip = { ...trip, boardingStop: sid };
                            }
                        }
                    }
                }
            }

            const walkingAdditions = new Map<string, RaptorLabel>();
            markedStops.forEach((sid) => {
                const sIdx = stopToIndex.get(sid)!;
                const arrivalAtSid = arrivalTimes[getFlatIdx(k, sIdx)];

                // Use the optimized findNearbyStops from DataManager
                const nearby = this.data.findNearbyStops(sid, 500);

                nearby.forEach((ns: Stop & { distance: number }) => {
                    const walkTime = Math.floor(ns.distance / 1.4);
                    const arrivalAtNs = arrivalAtSid + walkTime;
                    const nsIdx = stopToIndex.get(ns.stop_id)!;
                    const flatIdxK = getFlatIdx(k, nsIdx);

                    if (arrivalAtNs < arrivalTimes[flatIdxK]) {
                        arrivalTimes[flatIdxK] = arrivalAtNs;
                        precedingStops[flatIdxK] = sIdx;
                        precedingTrips.set(flatIdxK, "WALKING");
                        precedingRoutes.set(flatIdxK, "WALKING");
                        isWalking[flatIdxK] = 1;
                        walkingAdditions.set(ns.stop_id, {
                            arrivalTime: arrivalAtNs,
                            precedingStopId: sid,
                            precedingTripId: "WALKING",
                            precedingRouteId: "WALKING",
                            isWalking: true,
                            round: k
                        });
                    }
                });
            });
            walkingAdditions.forEach((_, sid) => markedStops.add(sid));

            if (markedStops.size === 0) break;
        }

        return this.reconstructPathsPhase2(
            arrivalTimes,
            precedingStops,
            precedingRoutes,
            isWalking,
            stopToIndex,
            stops,
            startStopId,
            destinationStopId,
            maxRounds,
        );
    }

    private reconstructPathsPhase2(
        arrivalTimes: Float64Array,
        precedingStops: Int32Array,
        precedingRoutes: Map<number, string>,
        isWalking: Uint8Array,
        stopToIndex: Map<string, number>,
        stops: Stop[],
        startStopId: string,
        destinationStopId: string,
        maxRounds: number,
    ): PathResult[] {
        const results: PathResult[] = [];
        const numStops = stops.length;
        const destIdx = stopToIndex.get(destinationStopId);
        if (destIdx === undefined) return [];

        const getFlatIdx = (k: number, sIdx: number) => k * numStops + sIdx;

        for (let k = 1; k <= maxRounds; k++) {
            const flatIdxDest = getFlatIdx(k, destIdx);
            const arrival = arrivalTimes[flatIdxDest];
            if (arrival === Infinity) continue;

            const segments: any[] = [];
            let currStopIdx = destIdx;
            let currRound = k;

            while (currStopIdx !== stopToIndex.get(startStopId) && currRound >= 0) {
                const fIdx = getFlatIdx(currRound, currStopIdx);
                const pIdx = precedingStops[fIdx];
                if (pIdx === -1) break;

                const fromS = stops[pIdx];
                const toS = stops[currStopIdx];
                const routeId = precedingRoutes.get(fIdx)!;
                const walkFlag = isWalking[fIdx];

                const dist = haversine(
                    fromS.stop_lat,
                    fromS.stop_lon,
                    toS.stop_lat,
                    toS.stop_lon,
                );

                segments.push({
                    fromStopId: fromS.stop_id,
                    toStopId: toS.stop_id,
                    fromStopLat: fromS.stop_lat,
                    fromStopLon: fromS.stop_lon,
                    toStopLat: toS.stop_lat,
                    toStopLon: toS.stop_lon,
                    arrivalTime: arrivalTimes[fIdx],
                    departureTime: 0,
                    distance: dist,
                });

                if (routeId !== "WALKING") {
                    const stps = this.data.getRouteStops(
                        routeId,
                        fromS.stop_id,
                        toS.stop_id,
                    );
                    segments[segments.length - 1].stops = stps;
                    segments[segments.length - 1].stopCount = Math.max(0, stps.length - 1);
                    segments[segments.length - 1].routeId = routeId;
                } else {
                    segments[segments.length - 1].routeId = "WALKING";
                    segments[segments.length - 1].stopCount = 0;
                }

                currStopIdx = pIdx;
                if (!walkFlag) currRound--;
            }

            if (segments.length > 0) {
                const reversedSegments = segments.reverse();
                const startFlatIdx = getFlatIdx(0, stopToIndex.get(startStopId)!);
                results.push({
                    totalTime: arrival - arrivalTimes[startFlatIdx],
                    totalFare: FareCalculator.calculateTotalFare(reversedSegments),
                    transfers: k - 1,
                    segments: reversedSegments,
                });
            }
        }

        return this.filterPareto(results).sort((a, b) =>
            a.totalTime - b.totalTime
        ).slice(0, 5);
    }

    private filterPareto(paths: PathResult[]): PathResult[] {
        return paths.filter((p1, i) =>
            !paths.some((p2, j) =>
                i !== j && p2.totalTime <= p1.totalTime &&
                p2.transfers < p1.transfers
            )
        );
    }

    private findEarliestTrip(
        trips: Trip[],
        stopIdx: number,
        minDeparture: number,
    ) {
        // trips are sorted by first stop departure
        // We can use binary search or simple early exit
        for (const trip of trips) {
            const st = trip.stopTimes[stopIdx];
            if (!st) continue;
            const dep = this.timeToSeconds(st.departure);
            if (dep >= minDeparture) {
                return trip;
            }
        }
        return null;
    }


    private timeToSeconds(time: string): number {
        const parts = time.split(":").map(Number);
        if (parts.length === 3) {
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
        return parts[0] * 3600 + parts[1] * 60;
    }
}
