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
        filter: TransitFilter,
        maxRounds: number = 3,
    ): Promise<PathResult[]> {
        // 1. Explicit Engine Reset / Cache Initializations (Deep Search)
        const startTime = this.timeToSeconds(startTimeStr);
        const stops = this.data.getAllStops();
        const numStops = stops.length;
        
        let interchangePenalty = 300; // 5 mins default
        
        if (filter === "MIN_FARE") {
            interchangePenalty = 1800; // Transfers are expensive (30 mins)
        } else if (filter === "MIN_INTERCHANGES") {
            interchangePenalty = 6000; // 100-minute 'Virtual Penalty' as ordered
        }

        // Map stop_id to numeric index for flat array
        const stopToIndex = new Map<string, number>();
        stops.forEach((s, i) => stopToIndex.set(s.stop_id, i));

        // earliestArrival & earliestCost: [round][stop] - reset on every call
        const earliestArrival = new Float64Array((maxRounds + 1) * numStops).fill(Infinity);
        const earliestCost = new Float64Array((maxRounds + 1) * numStops).fill(Infinity);
        
        // Store preceding info only for reachable stops to save memory/initialization time
        const precedingStops = new Int32Array((maxRounds + 1) * numStops).fill(-1);
        const precedingRoutes = new Map<number, string>(); // index in flat array -> routeId
        const precedingTrips = new Map<number, string>();
        const boardingTimes = new Map<number, number>();
        const isWalking = new Uint8Array((maxRounds + 1) * numStops).fill(0);

        const getFlatIdx = (k: number, sIdx: number) => k * numStops + sIdx;

        // Set start point
        const startIdx = stopToIndex.get(startStopId)!;
        earliestArrival[getFlatIdx(0, startIdx)] = startTime;
        earliestCost[getFlatIdx(0, startIdx)] = 0;
        const markedStops = new Set<string>([startStopId]);
        let bestTargetArrival = Infinity; // Physical time
        let bestTargetCost = Infinity;
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

            if (startTime + walkTime < earliestArrival[flatIdx]) {
                earliestArrival[flatIdx] = startTime + walkTime;
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

                for (let i = startIdxInRoute + 1; i < route.stops.length; i++) {
                    const sid = route.stops[i];
                    const sIdx = stopToIndex.get(sid)!;
                    const flatIdxK = getFlatIdx(k, sIdx);

                    if (currentTrip) {
                        const st: StopTime | undefined = currentTrip.stopTimes[i];
                        if (st && st.stopId === sid && st.departure) {
                            const arrival = st.arrivalSec || 0;
                            
                            // 1. Calculate Segment Cost
                            const isMetro = routeId.startsWith("PURPLE") || routeId.startsWith("GREEN") || routeId.startsWith("YELLOW");
                            const stopsFromBoarding = i - startIdxInRoute;
                            const segmentFare = this.calculateFareProxy(stopsFromBoarding, isMetro);
                            
                            const boardingStopIdx = stopToIndex.get(currentTrip.boardingStop)!;
                            const prevRoundCost = earliestCost[getFlatIdx(k - 1, boardingStopIdx)];
                            const totalCost = (prevRoundCost === Infinity ? 0 : prevRoundCost) + segmentFare;

                            // 2. Decision Logic (Pruning)
                            let shouldUpdate = false;
                            if (filter === "MIN_FARE") {
                                // MANDATORY: Mathematically prefer cheaper even if significantly slower
                                if (totalCost < earliestCost[flatIdxK]) {
                                    shouldUpdate = true;
                                } else if (totalCost === earliestCost[flatIdxK] && arrival < earliestArrival[flatIdxK]) {
                                    shouldUpdate = true; 
                                }
                            } else if (filter === "MIN_INTERCHANGES") {
                                // Penalize transfer legs by adding arrival 'weight'
                                const transferWeight = (k - 1) * interchangePenalty;
                                if (arrival + transferWeight < earliestArrival[flatIdxK] + ((k-2 >= 0) ? (k-2)*interchangePenalty : 0)) {
                                    shouldUpdate = true;
                                }
                            } else {
                                if (arrival < earliestArrival[flatIdxK]) {
                                    shouldUpdate = true;
                                }
                            }

                            if (shouldUpdate) {
                                earliestArrival[flatIdxK] = arrival;
                                earliestCost[flatIdxK] = totalCost;
                                precedingStops[flatIdxK] = boardingStopIdx;
                                precedingRoutes.set(flatIdxK, routeId);
                                precedingTrips.set(flatIdxK, currentTrip.tripId);
                                boardingTimes.set(flatIdxK, currentTrip.boardingTime);
                                isWalking[flatIdxK] = 0;
                                markedStops.add(sid);
                                
                                if (sIdx === targetIdx) {
                                    bestTargetArrival = Math.min(bestTargetArrival, arrival);
                                    bestTargetCost = Math.min(bestTargetCost, totalCost);
                                }
                            }
                        }
                    }

                    const prevArrival = earliestArrival[getFlatIdx(k - 1, sIdx)];
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
                const arrivalAtSid = earliestArrival[getFlatIdx(k, sIdx)];

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

                    if (arrivalAtNs < earliestArrival[flatIdxK]) {
                        earliestArrival[flatIdxK] = arrivalAtNs;
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
            earliestArrival,
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
            filter,
        );
    }

    private async reconstructPathsPhase2(
        earliestArrival: Float64Array,
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
        filter: TransitFilter,
    ): Promise<PathResult[]> {
        const results: PathResult[] = [];
        const numStops = stops.length;
        const destIdx = stopToIndex.get(destinationStopId);
        if (destIdx === undefined) return [];

        const getFlatIdx = (k: number, sIdx: number) => k * numStops + sIdx;

        for (let k = 1; k <= maxRounds; k++) {
            const flatIdxDest = getFlatIdx(k, destIdx);
            const arrival = earliestArrival[flatIdxDest];
            if (arrival === Infinity) continue;

            const segments: any[] = [];
            let currStopIdx = destIdx;
            let currRound = k;

            while (currStopIdx !== stopToIndex.get(startStopId) && currRound >= 0) {
                const fIdx = getFlatIdx(currRound, currStopIdx);
                const pIdx = precedingStops[fIdx];
                if (pIdx === -1 || pIdx === currStopIdx) break;

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
                    arrivalTime: earliestArrival[fIdx],
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
                    segments[segments.length - 1].routeLongName = this.data.getRoute(routeId)?.route_long_name;
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
                    totalTime: arrival - earliestArrival[startFlatIdx],
                    totalFare: FareCalculator.calculateTotalFare(reversedSegments),
                    transfers: k - 1,
                    segments: reversedSegments,
                });
            }
        }

        return this.filterPareto(results, filter).slice(0, 3);
    }

    private filterPareto(paths: PathResult[], filter: TransitFilter): PathResult[] {
        // Step 1: Pareto filtering
        const candidates = paths.filter((p1, i) =>
            !paths.some((p2, j) => {
                if (i === j) return false;
                
                if (filter === "MIN_FARE") {
                    return p2.totalFare <= p1.totalFare && p2.totalTime < p1.totalTime;
                }
                if (filter === "MIN_INTERCHANGES") {
                    return p2.transfers <= p1.transfers && p2.totalTime < p1.totalTime;
                }
                
                return p2.totalTime <= p1.totalTime && p2.transfers < p1.transfers;
            })
        );

        // Step 2: Diversity Filter (Task 2)
        // If two paths are 95% identical (same stops/buses), keep the faster one.
        const diverse: PathResult[] = [];
        for (const p of candidates) {
            let isDuplicate = false;
            for (const d of diverse) {
                if (this.isPathHighlySimilar(p, d)) {
                    isDuplicate = true;
                    break;
                }
            }
            if (!isDuplicate) diverse.push(p);
        }

        return diverse.sort((a, b) => {
            if (filter === "MIN_FARE") {
                if (a.totalFare !== b.totalFare) return a.totalFare - b.totalFare;
                return a.totalTime - b.totalTime;
            }
            if (filter === "MIN_INTERCHANGES") {
                if (a.transfers !== b.transfers) return a.transfers - b.transfers;
                return a.totalTime - b.totalTime;
            }
            return a.totalTime - b.totalTime;
        });
    }

    private isPathHighlySimilar(p1: PathResult, p2: PathResult): boolean {
        // Simple heuristic: same primary route IDs and same number of segments
        if (p1.segments.length !== p2.segments.length) return false;
        
        let matchCount = 0;
        for (let i = 0; i < p1.segments.length; i++) {
            const s1 = p1.segments[i];
            const s2 = p2.segments[i];
            // If route names are different (like 378 vs 500-D), it's diverse enough
            if (s1.routeName !== s2.routeName) return false;
            
            // If they are on the same route, check if the stops are identical
            if (s1.fromStopId === s2.fromStopId && s1.toStopId === s2.toStopId) {
                matchCount++;
            }
        }
        
        // If > 95% of segments match exactly (in our case of few segments, if all match)
        return matchCount / p1.segments.length > 0.95;
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

    private calculateFareProxy(stopCount: number, isMetro: boolean): number {
        if (isMetro) {
            // Metro Approximate
            if (stopCount <= 2) return 10;
            if (stopCount <= 5) return 20;
            if (stopCount <= 10) return 30;
            return 60;
        }
        // BMTC Ordinary Approximate (5-stage model)
        const stages = Math.ceil(stopCount / 2);
        if (stages <= 1) return 5;
        if (stages <= 2) return 10;
        if (stages <= 3) return 15;
        if (stages <= 4) return 20;
        if (stages <= 5) return 25;
        return 30;
    }

    private timeToSeconds(time: string): number {
        const parts = time.split(":").map(Number);
        if (parts.length === 3) {
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
        return parts[0] * 3600 + parts[1] * 60;
    }
}
