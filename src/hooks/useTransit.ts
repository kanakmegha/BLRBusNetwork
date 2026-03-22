import { useCallback, useEffect, useState } from "react";
import { DataManager } from "../engine/data_manager";
import { RaptorEngine } from "../engine/RaptorEngine";
import type { Stop } from "../engine/types";

export function useTransit() {
    const [dataManager] = useState(() => new DataManager());
    const [engine, setEngine] = useState<RaptorEngine | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [stops, setStops] = useState<Stop[]>([]);

    useEffect(() => {
        async function init() {
            await dataManager.init();
            setEngine(new RaptorEngine(dataManager));
            setStops(dataManager.getAllStops());
            setIsReady(true);
        }
        init();
    }, [dataManager]);

    const findRoute = useCallback(
        async (fromId: string, toId: string, time: string) => {
            if (!engine) return [];
            return await engine.findRoute(fromId, toId, time);
        },
        [engine],
    );

    const findNearestStop = useCallback(
        (lat: number, lon: number) => {
            return dataManager.findNearestStop(lat, lon);
        },
        [dataManager],
    );

    return { isReady, stops, findRoute, findNearestStop };
}
