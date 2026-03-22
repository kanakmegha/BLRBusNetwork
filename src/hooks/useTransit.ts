import { useCallback, useEffect, useState, useMemo } from "react";
import { DataManager } from "../engine/data_manager";
import { RaptorEngine } from "../engine/RaptorEngine";
import type { Stop, TransitFilter } from "../engine/types";

export function useTransit() {
    const [dataManager] = useState(() => new DataManager());
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isCalculating, setIsCalculating] = useState(false);
    const [activeFilter] = useState<TransitFilter>("FASTEST");
    const engine = useMemo(() => new RaptorEngine(dataManager), [dataManager]);
    const [stops, setStops] = useState<Stop[]>([]);

    useEffect(() => {
        async function init() {
            try {
                await dataManager.init();
                setStops(dataManager.getAllStops());
                setIsReady(true);
            } catch (err: any) {
                console.error("Transit Data Initialization Error:", err);
                setError(err.message || "Failed to initialize transit data");
            }
        }
        init();
    }, [dataManager]);

    const findRoute = useCallback(
        async (
            startId: string,
            destId: string,
            startTime: string,
            filter: TransitFilter = activeFilter,
        ) => {
            setIsCalculating(true);
            try {
                const results = await engine.findRoute(
                    startId,
                    destId,
                    startTime,
                    filter,
                );
                return results;
            } finally {
                setIsCalculating(false);
            }
        },
        [engine, activeFilter],
    );

    const findNearestStop = useCallback(
        (lat: number, lon: number) => {
            return dataManager.findNearestStop(lat, lon);
        },
        [dataManager],
    );

    return { isReady, error, isCalculating, activeFilter, stops, findRoute, findNearestStop, dataManager };
}
