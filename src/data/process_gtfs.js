import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";

const bmtcDir = "src/data/bmtc";
const outputDir = "src/data/processed";

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

function processGTFS() {
    console.log("Processing BMTC GTFS...");

    const stops = parse(fs.readFileSync(path.join(bmtcDir, "stops.txt")), {
        columns: true,
    });
    const routes = parse(fs.readFileSync(path.join(bmtcDir, "routes.txt")), {
        columns: true,
    });
    const trips = parse(fs.readFileSync(path.join(bmtcDir, "trips.txt")), {
        columns: true,
    });
    const stopTimes = parse(
        fs.readFileSync(path.join(bmtcDir, "stop_times.txt")),
        { columns: true },
    );

    // Index stops by ID
    const indexedStops = [];
    stops.forEach((stop) => {
        indexedStops.push({
            stop_id: stop.stop_id,
            stop_name: stop.stop_name,
            stop_lat: parseFloat(stop.stop_lat),
            stop_lon: parseFloat(stop.stop_lon),
        });
    });

    // Index trips by ID to get route_id easily
    const tripToRoute = {};
    trips.forEach((t) => {
        tripToRoute[t.trip_id] = t.route_id;
    });

    // Index routes by ID
    const indexedRoutes = {};
    routes.forEach((route) => {
        indexedRoutes[route.route_id] = {
            route_id: route.route_id,
            route_long_name: route.route_long_name,
            line_code: "BUS",
            stops: [],
        };
    });

    // Process stop times into trips and routes
    const stopTimesByTrip = {};
    stopTimes.forEach((st) => {
        if (!stopTimesByTrip[st.trip_id]) stopTimesByTrip[st.trip_id] = [];
        stopTimesByTrip[st.trip_id].push({
            stopId: st.stop_id,
            seq: parseInt(st.stop_sequence),
            arrival: st.arrival_time,
            departure: st.departure_time,
        });
    });

    // Sort stop times and set route stops if not already set
    Object.keys(stopTimesByTrip).forEach((tripId) => {
        const trip = stopTimesByTrip[tripId];
        trip.sort((a, b) => a.seq - b.seq);

        const routeId = tripToRoute[tripId];
        if (
            indexedRoutes[routeId] && indexedRoutes[routeId].stops.length === 0
        ) {
            indexedRoutes[routeId].stops = trip.map((s) => s.stopId);
        }
    });

    // Create route_id -> trip_id mapping for Raptor
    const routeTrips = {};
    trips.forEach((t) => {
        if (!routeTrips[t.route_id]) routeTrips[t.route_id] = [];
        routeTrips[t.route_id].push(t.trip_id);
    });

    fs.writeFileSync(
        path.join(outputDir, "bmtc_stops.json"),
        JSON.stringify(indexedStops),
    );
    fs.writeFileSync(
        path.join(outputDir, "bmtc_routes.json"),
        JSON.stringify(Object.values(indexedRoutes)),
    );
    fs.writeFileSync(
        path.join(outputDir, "bmtc_stop_times.json"),
        JSON.stringify(stopTimesByTrip),
    );
    fs.writeFileSync(
        path.join(outputDir, "bmtc_trips.json"),
        JSON.stringify(routeTrips),
    );

    console.log("BMTC processing complete.");
}

processGTFS();
