const fs = require("fs");
const path = require("path");

const STOPS_PATH = path.join(__dirname, "../data/processed/metro_stops.json");
const ROUTES_PATH = path.join(__dirname, "../data/processed/metro_routes.json");

const stops = JSON.parse(fs.readFileSync(STOPS_PATH, "utf8"));
const routes = JSON.parse(fs.readFileSync(ROUTES_PATH, "utf8"));

console.log(`Verifying ${stops.length} stops and ${routes.length} routes...`);

// 1. Check stop counts
const purpleStops = stops.filter((s) => s.line_code === "PURPLE");
const greenStops = stops.filter((s) => s.line_code === "GREEN");
const yellowStops = stops.filter((s) => s.line_code === "YELLOW");

console.log(`- Purple: ${purpleStops.length} (Expected: 36)`);
console.log(`- Green: ${greenStops.length} (Expected: 32)`);
console.log(`- Yellow: ${yellowStops.length} (Expected: 16)`);

// 2. Check Interchanges
const interchanges = ["MAST", "MGRC", "RVRD", "JAYD", "CSLB"];
interchanges.forEach((id) => {
    const instances = stops.filter((s) => s.stop_id === id);
    if (instances.length > 1) {
        const coords = instances.map((s) => `${s.stop_lat},${s.stop_lon}`);
        const uniqueCoords = [...new Set(coords)];
        if (uniqueCoords.length > 1) {
            console.error(
                `[ERROR] Interchange ${id} has mismatched coordinates:`,
                uniqueCoords,
            );
        } else {
            console.log(
                `- Interchange ${id} verified (Matches across ${instances.length} lines)`,
            );
        }
    } else {
        console.log(
            `- Node ${id} appears on only one line (Instances: ${instances.length})`,
        );
    }
});

// 3. Check Route Sequences
routes.forEach((route) => {
    route.stops.forEach((stopId) => {
        const exists = stops.find((s) => s.stop_id === stopId);
        if (!exists) {
            console.error(
                `[ERROR] Route ${route.route_id} references non-existent stop: ${stopId}`,
            );
        }
    });
});

console.log("Verification Complete.");
