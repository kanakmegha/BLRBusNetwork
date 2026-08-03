import { useEffect, useRef, useState } from "react";
import type { PathResult, Stop } from "../engine/types";
import { MapService } from "../utils/mapService";
import type { IMapInstance } from "../utils/mapService";
import { loadMapProvider } from "../utils/mapLoader";

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

    // Initialize Map Provider dynamically
    useEffect(() => {
        const initMap = async () => {
            try {
                if (mapRef.current && !mapInstance.current) {
                    const preferred = (import.meta.env.VITE_MAP_PROVIDER || "google") as any;
                    const loadedProvider = await loadMapProvider(preferred);
                    setActiveProviderName(loadedProvider);
                    console.log(`[MapComponent] Initializing map with provider: ${loadedProvider}`);

                    const inst = await MapService.initializeMap(mapRef.current, {
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
                    });

                    mapInstance.current = inst;
                    setMapInitialized(true);
                }
            } catch (err: any) {
                console.error("[MapComponent] Failed to initialize map:", err);
                setMapError(err.message || String(err));
            }
        };

        initMap();

        return () => {
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

    // Recenter map trigger
    useEffect(() => {
        const inst = mapInstance.current;
        if (!inst || !mapInitialized) return;
        
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

        const SEGMENT_COLORS = [
            "#FF007F", // Neon Pink
            "#00E5FF", // Cyan
            "#70FF00", // Lime
            "#FFD700", // Gold
            "#BF00FF", // Purple
            "#FF5F1F", // Blaze Orange
        ];

        const PATH_COLORS = [
            "#8B5CF6", // Purple
            "#F97316", // Orange
            "#3B82F6", // Blue
        ];

        const EXPLORER_COLOR = "#22c55e"; // Neon Green

        const renderPath = (path: PathResult, pathIdx: number, isSelected: boolean, isMuted: boolean = false) => {
            const pathCoordsForBounds: { lat: number; lng: number }[] = [];
            let lastColorIdx = -1;
            
            path.segments.forEach((seg, sIdx) => {
                const isWalking = seg.routeId === "WALKING";
                
                let colorIdx = sIdx % SEGMENT_COLORS.length;
                const isWarm = (idx: number) => [0, 3, 5].includes(idx);
                
                if (sIdx > 0 && !isWalking && lastColorIdx !== -1) {
                    if (isWarm(colorIdx) === isWarm(lastColorIdx)) {
                        colorIdx = (colorIdx + 1) % SEGMENT_COLORS.length;
                    }
                }
                if (!isWalking) lastColorIdx = colorIdx;

                let strokeColor = isWalking ? "#ffffff" : SEGMENT_COLORS[colorIdx];
                if (allPaths.length > 1 && !isSelected) {
                    strokeColor = isWalking ? "#ffffff" : PATH_COLORS[pathIdx % PATH_COLORS.length];
                }

                const pathCoords = seg.stops && seg.stops.length > 0
                    ? seg.stops.map((s) => ({ lat: s.stop_lat, lng: s.stop_lon }))
                    : [{ lat: seg.fromStopLat, lng: seg.fromStopLon }, { lat: seg.toStopLat, lng: seg.toStopLon }];

                pathCoords.forEach((c) => {
                    if (c && typeof c.lat === 'number' && typeof c.lng === 'number' && c.lat > 10 && c.lat < 15 && c.lng > 75 && c.lng < 80) {
                        pathCoordsForBounds.push(c);
                    }
                });

                // Segment Outlining
                if (!isWalking && isSelected && !isMuted) {
                    inst.addPolyline({
                        path: pathCoords,
                        strokeColor: "#000000",
                        strokeWeight: 14,
                        strokeOpacity: 0.8,
                        zIndex: 140,
                    });
                }

                inst.addPolyline({
                    path: pathCoords,
                    strokeColor: isWalking ? "#888888" : strokeColor,
                    strokeWeight: isSelected ? 8 : 4,
                    strokeOpacity: isWalking ? 0.5 : (isMuted ? 0.1 : (isSelected ? 1.0 : 0.4)),
                    zIndex: isSelected ? 150 : 100,
                    dashed: isWalking,
                });

                // Transfer Joint Nodes
                if (isSelected && sIdx < path.segments.length - 1 && !isMuted) {
                    const el = document.createElement("div");
                    el.style.width = "14px";
                    el.style.height = "14px";
                    el.style.backgroundColor = "#ffffff";
                    el.style.border = "4px solid #000000";
                    el.style.borderRadius = "50%";
                    el.style.boxSizing = "border-box";
                    
                    inst.addMarker({
                        position: { lat: seg.toStopLat, lng: seg.toStopLon },
                        html: el,
                        zIndex: 1000,
                        title: "Transfer Point",
                    });
                }

                // Markers for internal stops (only if selected)
                if (isSelected && seg.stops && !isMuted) {
                   seg.stops.forEach((stop) => {
                        const el = document.createElement("div");
                        el.style.width = "10px";
                        el.style.height = "10px";
                        el.style.backgroundColor = strokeColor;
                        el.style.border = "2px solid #000000";
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
                        strokeColor: EXPLORER_COLOR,
                        strokeWeight: 10,
                        strokeOpacity: 0.9,
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
                                originEl.style.width = "18px";
                                originEl.style.height = "18px";
                                originEl.style.backgroundColor = "#3B82F6";
                                originEl.style.border = "3px solid #ffffff";
                                originEl.style.borderRadius = "50%";
                                originEl.style.boxShadow = "0 0 10px rgba(59,130,246,0.8)";
                                
                                inst.addMarker({
                                    position: { lat: firstSeg.fromStopLat, lng: firstSeg.fromStopLon },
                                    html: originEl,
                                    zIndex: 2000,
                                    title: "Origin",
                                });
                            }

                            if (lastSeg.toStopLat && lastSeg.toStopLon) {
                                const destEl = document.createElement("div");
                                destEl.style.width = "18px";
                                destEl.style.height = "18px";
                                destEl.style.backgroundColor = "#A855F7";
                                destEl.style.border = "3px solid #ffffff";
                                destEl.style.borderRadius = "50%";
                                destEl.style.boxShadow = "0 0 10px rgba(168,85,247,0.8)";
                                
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
