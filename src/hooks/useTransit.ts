import { useCallback, useEffect, useState, useMemo } from "react";
import type { Stop, TransitFilter } from "../engine/types";

export function useTransit() {
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isCalculating, setIsCalculating] = useState(false);
    const [activeFilter] = useState<TransitFilter>("FASTEST");
    const [stops, setStops] = useState<Stop[]>([]);
    
    // Web Worker Instance
    const worker = useMemo(() => new Worker(new URL("../engine/routing.worker.ts", import.meta.url), { type: "module" }), []);

    useEffect(() => {
        worker.onmessage = (e) => {
            const { type, payload } = e.data;
            switch (type) {
                case "ready":
                    worker.postMessage({ type: "getStops" });
                    break;
                case "stops":
                    setStops(payload);
                    setIsReady(true);
                    break;
                case "error":
                    setError(payload);
                    break;
            }
        };

        worker.postMessage({ type: "init" });

        return () => worker.terminate();
    }, [worker]);

    const findRoute = useCallback(
        async (
            startId: string,
            destId: string,
            startTime: string,
            filter: TransitFilter = activeFilter,
        ) => {
            return new Promise((resolve, reject) => {
                setIsCalculating(true);
                
                const handler = (e: MessageEvent) => {
                    const { type, payload } = e.data;
                    if (type === "results") {
                        worker.removeEventListener("message", handler);
                        setIsCalculating(false);
                        resolve(payload);
                    } else if (type === "error") {
                        worker.removeEventListener("message", handler);
                        setIsCalculating(false);
                        reject(new Error(payload));
                    }
                };

                worker.addEventListener("message", handler);
                worker.postMessage({
                    type: "findRoute",
                    payload: { startId, destId, startTime, filter }
                });
            });
        },
        [worker, activeFilter],
    );

    const findNearestStop = useCallback(
        (lat: number, lon: number) => {
            // Since findNearestStop needs the stops array which we now have in state:
            let nearest: Stop | null = null;
            let minDist = Infinity;
            
            for (const stop of stops) {
                const dist = Math.sqrt(Math.pow(stop.stop_lat - lat, 2) + Math.pow(stop.stop_lon - lon, 2));
                if (dist < minDist) {
                    minDist = dist;
                    nearest = stop;
                }
            }
            return nearest;
        },
        [stops],
    );

    const getRoutePath = useCallback(
        async (busNumber: string) => {
            return new Promise<any[]>((resolve, reject) => {
                const handler = (e: MessageEvent) => {
                    const { type, payload } = e.data;
                    if (type === "routePath") {
                        worker.removeEventListener("message", handler);
                        resolve(payload);
                    } else if (type === "error") {
                        worker.removeEventListener("message", handler);
                        reject(new Error(payload));
                    }
                };
                worker.addEventListener("message", handler);
                worker.postMessage({ type: "getRoutePath", payload: { busNumber } });
            });
        },
        [worker],
    );

    return { isReady, error, isCalculating, activeFilter, stops, findRoute, findNearestStop, getRoutePath };
}
