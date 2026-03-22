import type { DataManager } from "./data_manager";
import type { PathResult, Stop, StopTime, TransitFilter, Trip } from "./types";
import { FareCalculator } from "./fare_calculator";
import { haversine } from "../utils/geo";

export class RaptorEngine {
    private data: DataManager;
    private routeStopIndices: Map<string, Map<string, number>> = new Map();

    constructor(data: DataManager) {
        this.data = data;
    }

    async findRoute(
        startStopId: string,
        destinationStopId: string,
        startTimeStr: string, // HH:MM:SS or HH:MM
        filter: TransitFilter = "Min Time",
        maxRounds: number = 3,
    ): Promise<PathResult[]> {
        const startTime = this.timeToSeconds(startTimeStr);
        const stops = this.data.getAllStops();
        const numStops = stops.length;
        
        let interchangePenalty = 300; // 5 mins
        if (filter === "Min Fare") interchangePenalty = 600; // Transfers are expensive

        // Map stop_id to numeric index for flat array
        const stopToIndex = new Map<string, number>();
        stops.forEach((s, i) => stopToIndex.set(s.stop_id, i));

        // Use flat Float64Array for arrival times: [round][stop]
        // size: (maxRounds + 1) * numStops
        const arrivalTimes = new Float64Array((maxRounds + 1) * numStops).fill(Infinity);
        
        // Store preceding info only for reachable stops to save memory/initialization time
        const precedingStops = new Int32Array((maxRounds + 1) * numStops).fill(-1);
        const precedingRoutes = new Map<number, string>(); // index in flat array -> routeId
        const precedingTrips = new Map<number, string>();
        const boardingTimes = new Map<number, number>();
        const isWalking = new Uint8Array((maxRounds + 1) * numStops).fill(0);

        const getFlatIdx = (k: number, sIdx: number) => k * numStops + sIdx;

        // Set start point
        const startIdx = stopToIndex.get(startStopId)!;
        arrivalTimes[getFlatIdx(0, startIdx)] = startTime;
        const markedStops = new Set<string>([startStopId]);
        let bestTargetArrival = Infinity;
        const targetIdx = stopToIndex.get(destinationStopId)!;

        // Pre-populate route stop indices for maximum speed
        const allRoutes = this.data.getAllRoutes();
        for (let i = 0; i < allRoutes.length; i++) {
            const r = allRoutes[i];
            if (!this.routeStopIndices.has(r.route_id)) {
                const map = new Map<string, number>();
                for (let j = 0; j < r.stops.length; j++) {
                    map.set(r.stops[j], j);
                }
                this.routeStopIndices.set(r.route_id, map);
            }
        }

        const initialNearby = this.data.findNearbyStops(startStopId, 500);
        for (let i = 0; i < initialNearby.length; i++) {
            const ns = initialNearby[i] as Stop & { distance: number };
            const walkTime = Math.floor(ns.distance / 1.1); // ~4km/h
            const nsIdx = stopToIndex.get(ns.stop_id)!;
            const flatIdx = getFlatIdx(0, nsIdx);

            if (startTime + walkTime < arrivalTimes[flatIdx]) {
                arrivalTimes[flatIdx] = startTime + walkTime;
                precedingStops[flatIdx] = startIdx;
                precedingRoutes.set(flatIdx, "WALKING");
                boardingTimes.set(flatIdx, startTime);
                isWalking[flatIdx] = 1;
                markedStops.add(ns.stop_id);
            }
        }

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
                const trips = routeTripsMap.get(routeId)!;
                let currentTrip: (Trip & { boardingStop: string; boardingTime: number }) | null = null;

                const startIdxInRoute = this.getRouteStopIndex(routeId, boardingStopId);

                for (let i = startIdxInRoute; i < route.stops.length; i++) {
                    const sid = route.stops[i];
                    const sIdx = stopToIndex.get(sid)!;
                    const flatIdxK = getFlatIdx(k, sIdx);

                    if (currentTrip) {
                        const st: StopTime | undefined = currentTrip.stopTimes[i];
                        if (st && st.stopId === sid && st.departure) { // Safety check
                            const arrival = st.arrivalSec || 0;
                            
                            // Optimized: only check against best arrival in previous rounds
                            let bestArrivalSoFar = arrivalTimes[getFlatIdx(k - 1, sIdx)];
                            if (arrivalTimes[flatIdxK] < bestArrivalSoFar) bestArrivalSoFar = arrivalTimes[flatIdxK];

                            if (arrival < bestTargetArrival && arrival < bestArrivalSoFar) {
                                arrivalTimes[flatIdxK] = arrival;
                                precedingStops[flatIdxK] = stopToIndex.get(currentTrip.boardingStop)!;
                                precedingRoutes.set(flatIdxK, routeId);
                                precedingTrips.set(flatIdxK, currentTrip.tripId);
                                boardingTimes.set(flatIdxK, currentTrip.boardingTime);
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
                            prevArrival + 60 + (k > 1 ? interchangePenalty : 0),
                        );
                        if (trip) {
                            const st = trip.stopTimes[i];
                            if (!st || !st.departure) continue; // Safety check
                            const stopDepTime = st.departureSec || 0;
                            
                            // Null check for currentTrip.stopTimes[i] as requested
                            const currentTripST = currentTrip ? currentTrip.stopTimes[i] : null;
                            const currentTripDepTime = currentTripST ? (currentTripST.departureSec || 0) : Infinity;

                            if (!currentTrip || stopDepTime < currentTripDepTime) {
                                currentTrip = { ...trip, boardingStop: sid, boardingTime: stopDepTime };
                            }
                        }
                    }
                }
            }

            const markedArray = Array.from(markedStops);
            for (let i = 0; i < markedArray.length; i++) {
                const sid = markedArray[i];
                const sIdx = stopToIndex.get(sid)!;
                const arrivalAtSid = arrivalTimes[getFlatIdx(k, sIdx)];

                const nearby = this.data.findNearbyStops(sid, 2000); // Allow longer walks but with penalty
                for (let j = 0; j < nearby.length; j++) {
                    const ns = nearby[j] as Stop & { distance: number };
                    const walkTime = Math.floor(ns.distance / 1.4);
                    let distancePenalty = 0;
                    if (ns.distance > 500) {
                        distancePenalty = Math.floor((ns.distance - 500) * 10); // Massive penalty for long walks
                    }
                    const arrivalAtNs = arrivalAtSid + walkTime + distancePenalty;
                    const nsIdx = stopToIndex.get(ns.stop_id)!;
                    const flatIdxK = getFlatIdx(k, nsIdx);

                    if (arrivalAtNs < arrivalTimes[flatIdxK]) {
                        arrivalTimes[flatIdxK] = arrivalAtNs;
                        precedingStops[flatIdxK] = sIdx;
                        precedingRoutes.set(flatIdxK, "WALKING");
                        boardingTimes.set(flatIdxK, arrivalAtSid);
                        isWalking[flatIdxK] = 1;
                        markedStops.add(ns.stop_id);
                    }
                }
            }

            if (markedStops.size === 0) break;
        }

        return await this.reconstructPathsPhase2(
            arrivalTimes,
            precedingStops,
            precedingRoutes,
            precedingTrips,
            boardingTimes,
            isWalking,
            stopToIndex,
            stops,
            startStopId,
            destinationStopId,
            maxRounds,
        );
    }

    private async reconstructPathsPhase2(
        arrivalTimes: Float64Array,
        precedingStops: Int32Array,
        precedingRoutes: Map<number, string>,
        precedingTrips: Map<number, string>,
        boardingTimes: Map<number, number>,
        isWalking: Uint8Array,
        stopToIndex: Map<string, number>,
        stops: Stop[],
        startStopId: string,
        destinationStopId: string,
        maxRounds: number,
    ): Promise<PathResult[]> {
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
                const tripId = precedingTrips.get(fIdx);
                const departureTime = boardingTimes.get(fIdx) || 0;

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
                    departureTime: departureTime,
                    distance: dist,
                    tripId: tripId,
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
                    segments[segments.length - 1].routeName = this.data.getRouteName(routeId);
                } else {
                    segments[segments.length - 1].routeId = "WALKING";
                    segments[segments.length - 1].routeName = "Walking";
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
        for (let i = 0; i < trips.length; i++) {
            const trip = trips[i];
            const st = trip.stopTimes[stopIdx];
            if (st && (st.departureSec || 0) >= minDeparture) {
                return trip;
            }
        }
        return null;
    }

    private getRouteStopIndex(routeId: string, stopId: string): number {
        const indices = this.routeStopIndices.get(routeId);
        if (!indices) {
            // This should ideally not happen if routeStopIndices is populated correctly
            // but as a fallback, we can re-populate for this route
            const route = this.data.getRoute(routeId)!;
            const newIndices = new Map<string, number>();
            route.stops.forEach((s: string, idx: number) => newIndices.set(s, idx));
            this.routeStopIndices.set(routeId, newIndices);
            return newIndices.get(stopId)!;
        }
        return indices.get(stopId)!;
    }

    private timeToSeconds(time: string): number {
        const parts = time.split(":").map(Number);
        if (parts.length === 3) {
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
        return parts[0] * 3600 + parts[1] * 60;
    }
}
