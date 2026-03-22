import type { Route, Stop, StopTime, Trip } from "./types";
import { haversine } from "../utils/geo";

const DB_NAME = "TransitDB";
const DB_VERSION = 1;

export class DataManager {
    private stops: Map<string, Stop> = new Map();
    private routes: Map<string, Route> = new Map();
    private stopsArray: Stop[] = [];
    private routeTrips: Map<string, string[]> = new Map();
    private stopRoutes: Map<string, string[]> = new Map();
    private routeNames: Map<string, string> = new Map();
    private cleanShortNames: Map<string, string> = new Map();
    private tripToRoute: Map<string, string> = new Map();
    private grid: Map<string, string[]> = new Map();
    private readonly GRID_SIZE = 0.005; // ~550m cells for faster localized search
    private db: IDBDatabase | null = null;

    async init() {
        // 1. Load data from public dir
        const metroStops = await (await fetch("/data/metro_stops.json")).json();
        const metroRoutes = await (await fetch("/data/metro_routes.json"))
            .json();
        const bmtcStops = await (await fetch("/data/bmtc_stops.json")).json();
        const bmtcRoutes = await (await fetch("/data/bmtc_routes.json")).json();
        const bmtcTrips = await (await fetch("/data/bmtc_trips.json")).json();

        // 2. Index stations
        metroStops.forEach((s: any) => this.stops.set(s.stop_id, s));
        bmtcStops.forEach((s: any) => this.stops.set(s.stop_id, s));

        // 3. Index routes
        metroRoutes.forEach((r: any) => this.indexRoute(r));
        bmtcRoutes.forEach((r: any) => this.indexRoute(r));

        // 4. Index route metadata
        Object.keys(bmtcTrips).forEach((rid) => {
            this.routeTrips.set(rid, bmtcTrips[rid]);
            bmtcTrips[rid].forEach((tid: string) => {
                this.tripToRoute.set(tid, rid);
            });
        });

        // 5. Handle Metro Trips (Synthesized - High Frequency)
        this.synthesizeMetroTrips(metroRoutes);

        console.log(
            `DataManager: Loaded ${this.stops.size} stops and ${this.routes.size} routes.`,
        );

        this.stopsArray = Array.from(this.stops.values());

        // 6. Build Spatial Grid
        this.stopsArray.forEach(s => {
            const key = this.getGridKey(s.stop_lat, s.stop_lon);
            if (!this.grid.has(key)) this.grid.set(key, []);
            this.grid.get(key)!.push(s.stop_id);
        });

        // 7. Sync BMTC stop times to IndexedDB and hold connection
        this.db = await this.ensureStopTimesCached();
    }

    private getGridKey(lat: number, lon: number): string {
        return `${Math.floor(lat / this.GRID_SIZE)},${Math.floor(lon / this.GRID_SIZE)}`;
    }

    private tripsCache: Map<string, Trip[]> = new Map();

    private indexRoute(r: Route) {
        this.routes.set(r.route_id, r);
        
        // Smarter route name lookup
        let name = r.bus_number || r.route_short_name;
        
        if (!name && r.route_long_name) {
            // BMTC sometimes puts the route number at the end of route_long_name
            const parts = r.route_long_name.split(' ');
            const lastPart = parts[parts.length - 1];
            if (lastPart && /^[A-Z0-9-]+$/.test(lastPart)) {
                name = lastPart;
            }
        }
        
        if (!name) name = r.route_id;

        // Store clean short name without 'Bus ' prefix
        this.cleanShortNames.set(r.route_id, name);

        // Prepend mode if not present for the internal routeNames map
        let fullName = name;
        if (r.line_code === 'BUS' && !fullName.toLowerCase().includes('bus')) {
            fullName = `Bus ${fullName}`;
        }
        
        this.routeNames.set(r.route_id, fullName);

        r.stops.forEach((stopId: string) => {
            if (!this.stopRoutes.has(stopId)) {
                this.stopRoutes.set(stopId, []);
            }
            this.stopRoutes.get(stopId)!.push(r.route_id);
        });
    }

    private synthesizeMetroTrips(routes: Route[]) {
        routes.forEach((r) => {
            // Already has route_long_name like "Purple Line (...)"
            this.routeNames.set(r.route_id, r.route_long_name);

            // Mocking high frequency (every 5 mins)
            const tripIds = [];
            for (let h = 5; h < 23; h++) {
                for (let m = 0; m < 60; m += 10) {
                    tripIds.push(`TRIP_M_${r.route_id}_${h}_${m}`);
                }
            }
            this.routeTrips.set(r.route_id, tripIds);
        });
    }

    private async ensureStopTimesCached(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event: any) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains("stopTimes")) {
                    db.createObjectStore("stopTimes");
                }
            };

            request.onsuccess = async (event: any) => {
                const db = event.target.result;
                const tx = db.transaction("stopTimes", "readonly");
                const store = tx.objectStore("stopTimes");
                const countRequest = store.count();

                countRequest.onsuccess = async () => {
                    if (countRequest.result === 0) {
                        console.log("Caching BMTC stop times...");
                        const stopTimes =
                            await (await fetch("/data/bmtc_stop_times.json"))
                                .json();
                        const writeTx = db.transaction(
                            "stopTimes",
                            "readwrite",
                        );
                        const writeStore = writeTx.objectStore("stopTimes");
                        Object.keys(stopTimes).forEach((tid) =>
                            writeStore.put(stopTimes[tid], tid)
                        );
                        writeTx.oncomplete = () => resolve(db);
                    } else {
                        resolve(db);
                    }
                };
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getTripsForRoute(routeId: string): Promise<Trip[]> {
        const results = await this.getTripsForRoutes([routeId]);
        return results.get(routeId) || [];
    }

    getRouteName(routeId: string): string {
        return this.routeNames.get(routeId) || routeId;
    }

    getRouteShortName(routeId: string): string {
        return this.cleanShortNames.get(routeId) || routeId;
    }

    getDisplayNumber(routeId: string): string {
        return this.getRouteShortName(routeId);
    }

    getRouteByTrip(tripId: string): string | undefined {
        return this.tripToRoute.get(tripId);
    }

    async getTrip(tripId: string): Promise<Trip | undefined> {
        const routeId = this.getRouteByTrip(tripId);
        if (!routeId) return undefined;
        
        const trips = await this.getTripsForRoute(routeId);
        return trips.find(t => t.tripId === tripId);
    }

    getAllRoutes(): Route[] {
        return Array.from(this.routes.values());
    }

    async getTripsForRoutes(routeIds: string[]): Promise<Map<string, Trip[]>> {
        const results = new Map<string, Trip[]>();
        const bmtcToFetch: { routeId: string; tripIds: string[] }[] = [];

        for (let i = 0; i < routeIds.length; i++) {
            const rid = routeIds[i];
            if (this.tripsCache.has(rid)) {
                results.set(rid, this.tripsCache.get(rid)!);
            } else {
                const tripIds = this.routeTrips.get(rid) || [];
                if (tripIds.length === 0) {
                    results.set(rid, []);
                } else if (
                    rid.startsWith("PURPLE") || rid.startsWith("GREEN") ||
                    rid.startsWith("YELLOW")
                ) {
                    const trips = this.getMetroTrips(rid, tripIds);
                    // Convert times to seconds immediately
                    for (let j = 0; j < trips.length; j++) {
                        const t = trips[j];
                        for (let k = 0; k < t.stopTimes.length; k++) {
                            const st = t.stopTimes[k];
                            st.arrivalSec = this.timeToSeconds(st.arrival);
                            st.departureSec = this.timeToSeconds(st.departure);
                        }
                    }
                    this.tripsCache.set(rid, trips);
                    results.set(rid, trips);
                } else {
                    bmtcToFetch.push({ routeId: rid, tripIds });
                }
            }
        }

        if (bmtcToFetch.length > 0 && this.db) {
            const tx = this.db.transaction("stopTimes", "readonly");
            const store = tx.objectStore("stopTimes");

            const promises = bmtcToFetch.map((f) => {
                return new Promise<void>((resolve) => {
                    const routeTrips: Trip[] = [];
                    let completed = 0;
                    for (let x = 0; x < f.tripIds.length; x++) {
                        const tid = f.tripIds[x];
                        const req = store.get(tid);
                        req.onsuccess = () => {
                            if (req.result) {
                                // Convert times to seconds for BMTC trips
                                const stopTimes: StopTime[] = req.result;
                                for (let k = 0; k < stopTimes.length; k++) {
                                    const st = stopTimes[k];
                                    st.arrivalSec = this.timeToSeconds(st.arrival);
                                    st.departureSec = this.timeToSeconds(st.departure);
                                }
                                routeTrips.push({
                                    tripId: tid,
                                    routeId: f.routeId,
                                    stopTimes: stopTimes,
                                });
                            }
                            if (++completed === f.tripIds.length) {
                                routeTrips.sort((a, b) =>
                                    (a.stopTimes[0].departureSec || 0) - (b.stopTimes[0].departureSec || 0)
                                );
                                this.tripsCache.set(f.routeId, routeTrips);
                                results.set(f.routeId, routeTrips);
                                resolve();
                            }
                        };
                        req.onerror = () => {
                            if (++completed === f.tripIds.length) resolve();
                        };
                    }
                });
            });
            await Promise.all(promises);
        }

        return results;
    }

    private timeToSeconds(time: string): number {
        const parts = time.split(":").map(Number);
        if (parts.length === 3) {
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
        return parts[0] * 3600 + parts[1] * 60;
    }

    private getMetroTrips(routeId: string, tripIds: string[]): Trip[] {
        const route = this.routes.get(routeId)!;
        return tripIds.map((tid) => {
            const parts = tid.split("_");
            const h = parseInt(parts[parts.length - 2]);
            const m = parseInt(parts[parts.length - 1]);

            let currentTime = h * 3600 + m * 60;
            const stopTimes = route.stops.map((sid, idx) => {
                const arrival = this.formatTime(currentTime);
                currentTime += 120; // 2 mins between metro stations
                const departure = this.formatTime(currentTime);
                return { stopId: sid, seq: idx + 1, arrival, departure };
            });

            return { tripId: tid, routeId, stopTimes };
        });
    }


    private formatTime(s: number): string {
        const h = Math.floor(s / 3600).toString().padStart(2, "0");
        const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
        const sec = (s % 60).toString().padStart(2, "0");
        return `${h}:${m}:${sec}`;
    }

    getRoutesForStop(stopId: string): string[] {
        return this.stopRoutes.get(stopId) || [];
    }

    getStopBusNumbers(stopId: string): string[] {
        const routeIds = this.getRoutesForStop(stopId);
        return Array.from(
            new Set(
                routeIds.map((rid) =>
                    this.routes.get(rid)?.route_short_name || rid
                ),
            ),
        );
    }

    getRoute(routeId: string): Route | undefined {
        return this.routes.get(routeId);
    }

    getStop(stopId: string): Stop | undefined {
        return this.stops.get(stopId);
    }

    getAllStops(): Stop[] {
        return this.stopsArray;
    }

    findNearestStop(lat: number, lon: number): Stop | null {
        let nearest: Stop | null = null;
        let minDist = Infinity;

        // Quick pass: only check stops within ~0.05 degrees (~5.5km)
        const candidates = this.stopsArray.filter((s) =>
            Math.abs(s.stop_lat - lat) < 0.05 &&
            Math.abs(s.stop_lon - lon) < 0.05
        );

        const targetList = candidates.length > 0 ? candidates : this.stopsArray;

        for (const stop of targetList) {
            const dist = haversine(lat, lon, stop.stop_lat, stop.stop_lon);
            if (dist < minDist) {
                minDist = dist;
                nearest = stop;
            }
        }
        return nearest;
    }

    findNearbyStops(
        stopId: string,
        radius: number,
    ): (Stop & { distance: number })[] {
        const source = this.stops.get(stopId);
        if (!source) return [];

        const candidates = this.getCandidatesInRadius(source.stop_lat, source.stop_lon, radius);

        return candidates
            .filter((s) => s.stop_id !== stopId)
            .map((s) => ({
                ...s,
                distance: haversine(
                    source.stop_lat,
                    source.stop_lon,
                    s.stop_lat,
                    s.stop_lon,
                ),
            }))
            .filter((s) => s.distance <= radius);
    }

    private getCandidatesInRadius(lat: number, lon: number, radiusMeters: number): Stop[] {
        const degLimit = (radiusMeters + 50) / 111000;
        const minLat = lat - degLimit;
        const maxLat = lat + degLimit;
        const minLon = lon - degLimit;
        const maxLon = lon + degLimit;

        const results: Stop[] = [];
        const seen = new Set<string>();

        for (let l = minLat; l <= maxLat + this.GRID_SIZE; l += this.GRID_SIZE) {
            for (let o = minLon; o <= maxLon + this.GRID_SIZE; o += this.GRID_SIZE) {
                const key = this.getGridKey(l, o);
                const stopIds = this.grid.get(key);
                if (stopIds) {
                    stopIds.forEach(sid => {
                        if (!seen.has(sid)) {
                            seen.add(sid);
                            const s = this.stops.get(sid)!;
                            if (s.stop_lat >= minLat && s.stop_lat <= maxLat &&
                                s.stop_lon >= minLon && s.stop_lon <= maxLon) {
                                results.push(s);
                            }
                        }
                    });
                }
            }
        }
        return results;
    }

    calculateDistance(
        lat1: number,
        lon1: number,
        lat2: number,
        lon2: number,
    ): number {
        return haversine(lat1, lon1, lat2, lon2);
    }

    getRouteStops(
        routeId: string,
        fromStopId: string,
        toStopId: string,
    ): (Stop & { busNumbers: string[] })[] {
        const route = this.routes.get(routeId);
        if (!route) return [];

        const fromIdx = route.stops.indexOf(fromStopId);
        const toIdx = route.stops.indexOf(toStopId);
        if (fromIdx === -1 || toIdx === -1) return [];

        const slice = fromIdx <= toIdx
            ? route.stops.slice(fromIdx, toIdx + 1)
            : route.stops.slice(toIdx, fromIdx + 1).reverse();

        return slice
            .map((id) => {
                const stop = this.stops.get(id);
                if (!stop) return null;
                return {
                    ...stop,
                    busNumbers: this.getStopBusNumbers(id),
                };
            })
            .filter((s): s is Stop & { busNumbers: string[] } => s !== null);
    }

    getBusNumbersForSegment(
        fromStopId: string,
        toStopId: string,
        stopSequence: string[],
    ): string[] {
        const busNumbers = new Set<string>();
        const routesAtStart = this.getRoutesForStop(fromStopId);

        for (const rid of routesAtStart) {
            const route = this.routes.get(rid);
            if (!route || route.line_code !== "BUS") continue;

            const fromIdx = route.stops.indexOf(fromStopId);
            const toIdx = route.stops.indexOf(toStopId);

            if (fromIdx !== -1 && toIdx !== -1 && fromIdx < toIdx) {
                const routeSlice = route.stops.slice(fromIdx, toIdx + 1);
                // Check if the sequence of stop IDs matches exactly
                if (routeSlice.length === stopSequence.length) {
                    let match = true;
                    for (let i = 0; i < routeSlice.length; i++) {
                        if (routeSlice[i] !== stopSequence[i]) {
                            match = false;
                            break;
                        }
                    }
                    if (match) {
                        const name = this.getRouteShortName(rid);
                        busNumbers.add(name);
                    }
                }
            }
        }
        return Array.from(busNumbers);
    }
}
