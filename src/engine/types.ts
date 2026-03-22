export interface Stop {
    stop_id: string;
    stop_name: string;
    stop_lat: number;
    stop_lon: number;
    line_code?: string; // For Metro
    busNumbers?: string[]; // Enrich for visualization
}

export interface Route {
    route_id: string;
    route_short_name: string;
    route_long_name: string;
    bus_number?: string;
    line_code: string;
    stops: string[]; // Sequential list of stop IDs
}

export interface StopTime {
    stopId: string;
    seq: number;
    arrival: string; // HH:MM:SS
    departure: string; // HH:MM:SS
    arrivalSec?: number; // Seconds since midnight
    departureSec?: number; // Seconds since midnight
}

export interface Trip {
    tripId: string;
    routeId: string;
    stopTimes: StopTime[];
}

export interface RaptorLabel {
    round: number;
    arrivalTime: number; // Seconds since midnight
    precedingStopId: string | null;
    precedingTripId: string | null;
    precedingRouteId: string | null;
    isWalking: boolean;
}

export interface PathResult {
    totalTime: number;
    totalFare: number;
    transfers: number;
    segments: PathSegment[];
}

export type TransitFilter = "Min Fare" | "Min Interchange" | "Min Time";

export interface PathSegment {
    fromStopId: string;
    toStopId: string;
    fromStopLat: number;
    fromStopLon: number;
    toStopLat: number;
    toStopLon: number;
    routeId: string | "WALKING";
    routeName?: string; // e.g. "Bus 378" or "Purple Line"
    routeLongName?: string; // e.g. "Kengeri to Electronic City"
    tripId?: string;
    departureTime: number;
    arrivalTime: number;
    stopCount?: number;
    distance?: number;
    stops?: Stop[];
}
