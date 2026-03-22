import type { PathSegment } from "./types";

export class FareCalculator {
    /**
     * Calculates the fare for a single path segment.
     * Based on Bengaluru Namma Metro and BMTC fare structures (2025).
     */
    static calculateSegmentFare(
        segment: PathSegment,
        routeType: "METRO" | "BUS" | "WALKING",
    ): number {
        if (routeType === "WALKING" || segment.routeId === "WALKING") return 0;

        if (routeType === "METRO") {
            // Namma Metro 2025 Stage-based Fare (based on station count)
            // Since segments currently only represent A->B, we need to know the number of stations.
            // For now, we'll approximate based on distance if station count isn't immediately available,
            // or we can count stops if the segment contains them.
            // Approximating 1 station = 1.2km
            const stopCount = segment.stopCount || 1; // Fallback to 1 if not provided

            if (stopCount <= 2) return 10;
            if (stopCount <= 4) return 20;
            if (stopCount <= 6) return 30;
            if (stopCount <= 8) return 40;
            if (stopCount <= 10) return 50;
            if (stopCount <= 15) return 60;
            if (stopCount <= 20) return 70;
            if (stopCount <= 25) return 80;
            return 90;
        }

        if (routeType === "BUS") {
            // BMTC 2025 Stage-based Fare (Approximate)
            // 1 Stage = ~2km. Fares: 5, 10, 15, 20, 25...
            const distanceKm = segment.distance ? segment.distance / 1000 : 2;
            const stages = Math.ceil(distanceKm / 2);

            if (stages <= 1) return 5;
            if (stages <= 2) return 10;
            if (stages <= 3) return 15;
            if (stages <= 4) return 20;
            if (stages <= 5) return 25;
            return 30; // Max cap for ordinary
        }

        return 0;
    }

    static calculateTotalFare(segments: PathSegment[]): number {
        return segments.reduce((total, seg) => {
            const type: "METRO" | "BUS" | "WALKING" =
                (seg.routeId.startsWith("PURPLE") ||
                        seg.routeId.startsWith("GREEN") ||
                        seg.routeId.startsWith("YELLOW"))
                    ? "METRO"
                    : (seg.routeId === "WALKING" ? "WALKING" : "BUS");
            return total + this.calculateSegmentFare(seg, type);
        }, 0);
    }
}
