import { useEffect, useRef, useState } from "react";
import type { PathResult, Stop } from "../engine/types";
import { MapService } from "../utils/mapService";
import type { IMapInstance } from "../utils/mapService";
import { getPreferredProvider, loadMapProvider, onAuthFailure } from "../utils/mapLoader";
import type { MapProviderType } from "../utils/mapLoader";

interface MapProps {
    stops: Stop[];
    selectedPath?: PathResult | null;
    allPaths?: PathResult[];
    explorerPath?: any[];
    recenterCount?: number;
    onStopSelect?: (stop: Stop) => void;
    center?: { lat: number; lng: number };
    onMapInteract?: () => void;
}

export function Map(
    {
        stops,
        selectedPath,
        allPaths = [],
        explorerPath = [],
        onStopSelect,
        center = { lat: 12.9716, lng: 77.5946 },
        recenterCount,
        onMapInteract,
    }: MapProps,
) {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<IMapInstance | null>(null);
    const [mapInitialized, setMapInitialized] = useState(false);
    const [mapError, setMapError] = useState<string | null>(null);
    const [activeProviderName, setActiveProviderName] = useState<string | null>(null);
    const lastBoundsFit = useRef<{ selectedPath: any, recenterCount: number }>({ selectedPath: null, recenterCount: -1 });

    // Initialize Map Provider dynamically with unmount cancellation & runtime auth-failure fallback
    useEffect(() => {
        let isCancelled = false;

        const mapConfig = {
            center,
            zoom: 12,
            minZoom: 10,
            maxZoom: 18,
            bounds: {
                north: 13.3,
                south: 12.7,
                east: 77.9,
                west: 77.3,
            },
            mapId: import.meta.env.VITE_GOOGLE_MAP_ID || "DEMO_MAP_ID",
        };

        const initMap = async () => {
            try {
                if (!mapRef.current || mapInstance.current) return;
                const preferred = getPreferredProvider();
                const loadedProvider = await loadMapProvider(preferred);
                if (isCancelled || !mapRef.current) return;

                setActiveProviderName(loadedProvider);
                console.log(`[MapComponent] Initializing map with provider: ${loadedProvider}`);

                const inst = await MapService.initializeMap(mapRef.current, mapConfig);
                if (isCancelled) {
                    await MapService.destroyMap();
                    return;
                }

                mapInstance.current = inst;
                setMapInitialized(true);
            } catch (err: any) {
                if (!isCancelled) {
                    console.error("[MapComponent] Failed to initialize map:", err);
                    setMapError(err.message || String(err));
                }
            }
        };

        const unsubscribeAuthFailure = onAuthFailure(async (failedProvider: MapProviderType) => {
            if (isCancelled || !mapRef.current) return;
            console.warn(`[MapComponent] Runtime auth failure for "${failedProvider}". Falling back to next provider.`);
            try {
                mapInstance.current = null;
                setMapInitialized(false);
                const nextProvider = await MapService.fallbackFromProvider(failedProvider);
                if (isCancelled || !mapRef.current) return;

                setActiveProviderName(nextProvider);
                const inst = await MapService.initializeMap(mapRef.current, mapConfig);
                if (isCancelled) {
                    await MapService.destroyMap();
                    return;
                }
                mapInstance.current = inst;
                setMapInitialized(true);
            } catch (err: any) {
                if (!isCancelled) {
                    console.error("[MapComponent] Fallback initialization failed:", err);
                    setMapError(err.message || String(err));
                }
            }
        });

        initMap();

        return () => {
            isCancelled = true;
            unsubscribeAuthFailure();
            if (mapInstance.current) {
                console.log("[MapComponent] Destroying map instance");
                MapService.destroyMap();
                mapInstance.current = null;
                setMapInitialized(false);
            }
        };
    }, []);

    // Handle center/panning updates dynamically
    useEffect(() => {
        if (mapInstance.current && mapInitialized) {
            mapInstance.current.panTo(center.lat, center.lng);
        }
    }, [center, mapInitialized]);

    const lastRecenterCount = useRef(0);

    // Recenter map trigger (only when recenterCount actually increments)
    useEffect(() => {
        const inst = mapInstance.current;
        if (!inst || !mapInitialized) return;
        if (!recenterCount || recenterCount === lastRecenterCount.current) return;
        lastRecenterCount.current = recenterCount;

        if (selectedPath || allPaths.length > 0 || (explorerPath && explorerPath.length > 0)) {
            // Recenter bounds logic will run on the other effect
        } else {
            // Centering to Bangalore defaults
            inst.panTo(12.9716, 77.5946);
            inst.setZoom(12);
        }
    }, [recenterCount, mapInitialized, selectedPath, allPaths, explorerPath]);

    // Setup map interaction listeners
    useEffect(() => {
        const inst = mapInstance.current;
        if (!inst || !mapInitialized) return;
        
        const cleanClick = inst.addListener("click", () => onMapInteract?.());
        const cleanDrag = inst.addListener("dragstart", () => onMapInteract?.());
        
        return () => {
            if (cleanClick) cleanClick();
            if (cleanDrag) cleanDrag();
        };
    }, [mapInitialized, onMapInteract]);

    // Main overlays and markers drawing effect
    useEffect(() => {
        const inst = mapInstance.current;
        if (!inst || !mapInitialized) return;

        const PRIMARY_ROUTE_COLOR = "#8B5CF6"; // Brand Purple
        const PRIMARY_CASING_COLOR = "#1E1B4B"; // Subtle dark indigo casing
        const ALT_ROUTE_COLOR = "#64748B"; // Muted slate for alternative routes
        const WALKING_COLOR = "#94A3B8"; // Restrained slate for walking segments
        const EXPLORER_COLOR = "#10B981"; // Restrained Emerald

        const renderPath = (path: PathResult, _pathIdx: number, isSelected: boolean, isMuted: boolean = false) => {
            const pathCoordsForBounds: { lat: number; lng: number }[] = [];

            path.segments.forEach((seg, sIdx) => {
                const isWalking = seg.routeId === "WALKING";

                const strokeColor = isWalking
                    ? WALKING_COLOR
                    : (isSelected ? PRIMARY_ROUTE_COLOR : ALT_ROUTE_COLOR);

                const pathCoords = seg.stops && seg.stops.length > 0
                    ? seg.stops.map((s) => ({ lat: s.stop_lat, lng: s.stop_lon }))
                    : [{ lat: seg.fromStopLat, lng: seg.fromStopLon }, { lat: seg.toStopLat, lng: seg.toStopLon }];

                pathCoords.forEach((c) => {
                    if (c && typeof c.lat === 'number' && typeof c.lng === 'number' && c.lat > 10 && c.lat < 15 && c.lng > 75 && c.lng < 80) {
                        pathCoordsForBounds.push(c);
                    }
                });

                // Subtle darker casing beneath primary transit segments (8.5px)
                if (!isWalking && isSelected && !isMuted) {
                    inst.addPolyline({
                        path: pathCoords,
                        strokeColor: PRIMARY_CASING_COLOR,
                        strokeWeight: 9,
                        strokeOpacity: 0.75,
                        zIndex: 140,
                    });
                }

                inst.addPolyline({
                    path: pathCoords,
                    strokeColor,
                    strokeWeight: isWalking ? (isSelected ? 3.5 : 2.5) : (isSelected ? 5.5 : 3.5),
                    strokeOpacity: isWalking
                        ? (isMuted ? 0.15 : (isSelected ? 0.8 : 0.25))
                        : (isMuted ? 0.12 : (isSelected ? 0.95 : 0.35)),
                    zIndex: isSelected ? 150 : 100,
                    dashed: isWalking,
                });

                // Transfer Joint Nodes (distinct white circle with dark purple border)
                if (isSelected && sIdx < path.segments.length - 1 && !isMuted) {
                    const el = document.createElement("div");
                    el.style.width = "12px";
                    el.style.height = "12px";
                    el.style.backgroundColor = "#FFFFFF";
                    el.style.border = "2.5px solid #4C1D95";
                    el.style.borderRadius = "50%";
                    el.style.boxSizing = "border-box";
                    el.style.boxShadow = "0 1px 4px rgba(0,0,0,0.6)";

                    inst.addMarker({
                        position: { lat: seg.toStopLat, lng: seg.toStopLon },
                        html: el,
                        zIndex: 1000,
                        title: "Transfer Point",
                    });
                }

                // Subtle dots for intermediate stops along the selected route
                if (isSelected && seg.stops && !isMuted && !isWalking) {
                    seg.stops.forEach((stop) => {
                        const el = document.createElement("div");
                        el.style.width = "7px";
                        el.style.height = "7px";
                        el.style.backgroundColor = "#DDD6FE";
                        el.style.border = "1.5px solid #1E1B4B";
                        el.style.borderRadius = "50%";
                        el.style.boxSizing = "border-box";

                        inst.addMarker({
                            position: { lat: stop.stop_lat, lng: stop.stop_lon },
                            html: el,
                        });
                    });
                }
            });

            return pathCoordsForBounds;
        };

        const updateMarkers = () => {
            try {
                inst.clearOverlays();
                const currentZoom = inst.getZoom() || 12;
                const bounds = inst.getBounds();
                
                // 1. User Location Marker
                const userEl = document.createElement("div");
                userEl.style.width = "16px";
                userEl.style.height = "16px";
                userEl.style.backgroundColor = "#4f46e5";
                userEl.style.border = "3px solid #ffffff";
                userEl.style.borderRadius = "50%";
                userEl.style.boxShadow = "0 0 10px rgba(79,70,229,0.5)";
                
                inst.addMarker({
                    position: center,
                    html: userEl,
                    title: "Your Location",
                    zIndex: 1000,
                });

                const totalCoords: { lat: number; lng: number }[] = [];

                if (explorerPath && explorerPath.length > 0) {
                    const pathCoords = explorerPath.map(s => ({ lat: s.stop_lat, lng: s.stop_lon }));
                    totalCoords.push(...pathCoords);

                    inst.addPolyline({
                        path: pathCoords,
                        strokeColor: "#064E3B",
                        strokeWeight: 9,
                        strokeOpacity: 0.75,
                        zIndex: 990,
                    });

                    inst.addPolyline({
                        path: pathCoords,
                        strokeColor: EXPLORER_COLOR,
                        strokeWeight: 5.5,
                        strokeOpacity: 0.95,
                        zIndex: 1000,
                    });

                    explorerPath.forEach(s => {
                        const el = document.createElement("div");
                        el.style.width = "12px";
                        el.style.height = "12px";
                        el.style.backgroundColor = EXPLORER_COLOR;
                        el.style.border = "2px solid #ffffff";
                        el.style.borderRadius = "50%";
                        el.style.boxSizing = "border-box";

                        inst.addMarker({
                            position: { lat: s.stop_lat, lng: s.stop_lon },
                            html: el,
                            title: s.stop_name,
                        });
                    });

                    // Render other paths muted
                    allPaths.forEach((path, idx) => {
                        renderPath(path, idx, path === selectedPath, true);
                    });
                } else if (allPaths.length > 0) {
                    const sortedPaths = [...allPaths].sort((a, b) => {
                        if (a === selectedPath) return 1;
                        if (b === selectedPath) return -1;
                        return 0;
                    });

                    sortedPaths.forEach((path) => {
                        const isSelected = path === selectedPath;
                        const originalIdx = allPaths.indexOf(path);
                        const pathCoords = renderPath(path, originalIdx, isSelected, false);
                        totalCoords.push(...pathCoords);
                        
                        if (isSelected && path.segments.length > 0) {
                            const firstSeg = path.segments[0];
                            const lastSeg = path.segments[path.segments.length - 1];
                            
                            if (firstSeg.fromStopLat && firstSeg.fromStopLon) {
                                const originEl = document.createElement("div");
                                originEl.style.width = "14px";
                                originEl.style.height = "14px";
                                originEl.style.backgroundColor = "#10B981";
                                originEl.style.border = "2.5px solid #FFFFFF";
                                originEl.style.borderRadius = "50%";
                                originEl.style.boxSizing = "border-box";
                                originEl.style.boxShadow = "0 1px 6px rgba(0,0,0,0.6)";
                                
                                inst.addMarker({
                                    position: { lat: firstSeg.fromStopLat, lng: firstSeg.fromStopLon },
                                    html: originEl,
                                    zIndex: 2000,
                                    title: "Origin",
                                });
                            }

                            if (lastSeg.toStopLat && lastSeg.toStopLon) {
                                const destEl = document.createElement("div");
                                destEl.style.width = "14px";
                                destEl.style.height = "14px";
                                destEl.style.backgroundColor = "#F43F5E";
                                destEl.style.border = "2.5px solid #FFFFFF";
                                destEl.style.borderRadius = "50%";
                                destEl.style.boxSizing = "border-box";
                                destEl.style.boxShadow = "0 1px 6px rgba(0,0,0,0.6)";
                                
                                inst.addMarker({
                                    position: { lat: lastSeg.toStopLat, lng: lastSeg.toStopLon },
                                    html: destEl,
                                    zIndex: 2000,
                                    title: "Destination",
                                });
                            }
                        }
                    });
                }
                
                // Adjust viewport to bounds
                if (totalCoords.length > 0) {
                     const shouldFitBounds = lastBoundsFit.current.selectedPath !== selectedPath || lastBoundsFit.current.recenterCount !== recenterCount;

                     if (shouldFitBounds) {
                         const isMobile = window.innerWidth < 768;
                         const bottomPadding = isMobile ? (window.innerHeight * 0.7) + 20 : 80;
                         const rightPadding = isMobile ? 20 : 450;
                         
                         inst.fitBounds(totalCoords, { 
                             top: 60, 
                             right: rightPadding, 
                             bottom: bottomPadding, 
                             left: 20 
                         });

                         lastBoundsFit.current = { selectedPath, recenterCount: recenterCount || 0 };
                     }
                } else if (currentZoom > 15 && bounds) {
                    // Show nearby stops
                    stops.forEach((stop) => {
                        const latLng = { lat: stop.stop_lat, lng: stop.stop_lon };
                        if (bounds.contains(latLng)) {
                            const el = document.createElement("div");
                            el.style.width = "8px";
                            el.style.height = "8px";
                            el.style.backgroundColor = stop.line_code === "BUS" ? "rgba(59,130,246,0.6)" : "rgba(168,85,247,0.6)";
                            el.style.border = "1px solid rgba(255,255,255,0.8)";
                            el.style.borderRadius = "50%";
                            
                            inst.addMarker({
                                position: latLng,
                                html: el,
                                onClick: () => onStopSelect?.(stop),
                            });
                        }
                    });
                }
            } catch (err: any) {
                console.error("[MapComponent] Error updating markers:", err);
            }
        };

        let debounceTimer: any;
        const debouncedUpdate = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(updateMarkers, 100);
        };

        updateMarkers();
        const cleanZoom = inst.addListener("zoom_changed", debouncedUpdate);
        const cleanIdle = inst.addListener("idle", debouncedUpdate);
        
        return () => {
            if (cleanZoom) cleanZoom();
            if (cleanIdle) cleanIdle();
            clearTimeout(debounceTimer);
        };
    }, [stops, selectedPath, allPaths, explorerPath, onStopSelect, center, recenterCount, mapInitialized]);

    if (mapError) {
        return (
            <div className="w-full h-full min-h-[500px] rounded-2xl bg-[#121212] flex items-center justify-center p-8 text-center text-white font-mono shadow-2xl">
                <div className="bg-red-500/20 p-6 rounded-xl border border-red-500/50 flex flex-col items-center gap-4">
                    <div>
                        <h2 className="text-red-400 font-bold mb-2">Map Error</h2>
                        <p className="text-sm text-gray-300">{mapError}</p>
                    </div>
                    <button 
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 bg-red-500/30 hover:bg-red-500/50 border border-red-500/50 rounded-lg text-sm transition-all"
                    >
                        Retry Connection
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="relative w-full h-full min-h-[500px] rounded-[24px] overflow-hidden bg-[#1e1e1e]">
            <div
                ref={mapRef}
                className="w-full h-full"
            />
            {activeProviderName && (
                <div className="absolute top-4 left-4 z-[99] bg-[#1a1a1a]/80 backdrop-blur-sm border border-white/10 px-3 py-1 rounded-full text-[9px] font-bold text-white uppercase tracking-wider">
                    🛰️ Active Map: {activeProviderName}
                </div>
            )}
        </div>
    );
}
