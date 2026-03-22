import { useCallback, useEffect, useState, useMemo } from "react";
import { DataManager } from "../engine/data_manager";
import { RaptorEngine } from "../engine/RaptorEngine";
import type { Stop, TransitFilter } from "../engine/types";

export function useTransit() {
    const [dataManager] = useState(() => new DataManager());
    const [isReady, setIsReady] = useState(false);
    const engine = useMemo(() => new RaptorEngine(dataManager), [dataManager]);
    const [stops, setStops] = useState<Stop[]>([]);

    useEffect(() => {
        async function init() {
            await dataManager.init();
            setStops(dataManager.getAllStops());
            setIsReady(true);
        }
        init();
    }, [dataManager]);

    const findRoute = useCallback(
        async (
            startId: string,
            destId: string,
            startTime: string,
            filter: TransitFilter = "Min Time",
        ) => {
            // engine is always defined due to useMemo and dataManager dependency
            return await engine.findRoute(
                startId,
                destId,
                startTime,
                filter,
            );
        },
        [engine],
    );

    const findNearestStop = useCallback(
        (lat: number, lon: number) => {
            return dataManager.findNearestStop(lat, lon);
        },
        [dataManager],
    );

    return { isReady, stops, findRoute, findNearestStop, dataManager };
}
