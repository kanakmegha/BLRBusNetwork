/// <reference types="@types/google.maps" />
import { useEffect, useRef, useState } from "react";
import type { PathResult, Stop } from "../engine/types";

interface MapProps {
    stops: Stop[];
    selectedPath?: PathResult | null;
    allPaths?: PathResult[];
    explorerPath?: any[];
    recenterCount?: number;
    onStopSelect?: (stop: Stop) => void;
    center?: { lat: number; lng: number };
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
    }: MapProps,
) {
    const mapRef = useRef<HTMLDivElement>(null);
    const googleMap = useRef<google.maps.Map | null>(null);
    const [mapInitialized, setMapInitialized] = useState(false);
    const [mapError, setMapError] = useState<string | null>(null);
    const markers = useRef<any[]>([]);
    const polylines = useRef<google.maps.Polyline[]>([]);
    const lastBoundsFit = useRef<{ selectedPath: any, recenterCount: number }>({ selectedPath: null, recenterCount: -1 });

    useEffect(() => {
        const initMap = async () => {
            try {
                if (mapRef.current && !googleMap.current && (window as any).google) {
                    const { Map } = await (window as any).google.maps.importLibrary("maps");
                    googleMap.current = new Map(mapRef.current, {
                        center: { lat: 12.9716, lng: 77.5946 },
                        zoom: 12,
                        minZoom: 10,
                        maxZoom: 18,
                        restriction: {
                            latLngBounds: {
                                north: 13.3,
                                south: 12.7,
                                east: 77.9,
                                west: 77.3,
                            },
                            strictBounds: false,
                        },
                        disableDefaultUI: true,
                        backgroundColor: "#121212",
                        gestureHandling: "greedy",
                        colorScheme: "DARK",
                        mapId: import.meta.env.VITE_GOOGLE_MAP_ID || "DEMO_MAP_ID",
                        styles: [
                            { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
                            { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
                            { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
                            {
                                featureType: "administrative.locality",
                                elementType: "labels.text.fill",
                                stylers: [{ color: "#d59563" }],
                            },
                            {
                                featureType: "poi",
                                elementType: "labels.text.fill",
                                stylers: [{ color: "#d59563" }],
                            },
                            {
                                featureType: "poi.park",
                                elementType: "geometry",
                                stylers: [{ color: "#263c3f" }],
                            },
                            {
                                featureType: "poi.park",
                                elementType: "labels.text.fill",
                                stylers: [{ color: "#6b9a76" }],
                            },
                            {
                                featureType: "road",
                                elementType: "geometry",
                                stylers: [{ color: "#38414e" }],
                            },
                            {
                                featureType: "road",
                                elementType: "geometry.stroke",
                                stylers: [{ color: "#212a37" }],
                            },
                            {
                                featureType: "road",
                                elementType: "labels.text.fill",
                                stylers: [{ color: "#9ca5b3" }],
                            },
                            {
                                featureType: "road.highway",
                                elementType: "geometry",
                                stylers: [{ color: "#746855" }],
                            },
                            {
                                featureType: "road.highway",
                                elementType: "geometry.stroke",
                                stylers: [{ color: "#1f2835" }],
                            },
                            {
                                featureType: "road.highway",
                                elementType: "labels.text.fill",
                                stylers: [{ color: "#f3d19c" }],
                            },
                            {
                                featureType: "transit",
                                elementType: "geometry",
                                stylers: [{ color: "#2f3948" }],
                            },
                            {
                                featureType: "transit.station",
                                elementType: "labels.text.fill",
                                stylers: [{ color: "#d59563" }],
                            },
                            {
                                featureType: "water",
                                elementType: "geometry",
                                stylers: [{ color: "#17263c" }],
                            },
                            {
                                featureType: "water",
                                elementType: "labels.text.fill",
                                stylers: [{ color: "#515c6d" }],
                            },
                            {
                                featureType: "water",
                                elementType: "labels.text.stroke",
                                stylers: [{ color: "#17263c" }],
                            },
                        ],
                    });
                    setMapInitialized(true);
                }
            } catch (err: any) {
                setMapError(err.message || String(err));
            }
        };

        const handleAuthFailure = () => {
            setMapError("Maps failed to load. Please check your internet connection or API restrictions.");
        };

        if ((window as any).google) {
            initMap();
        } else {
            window.addEventListener('google-maps-loaded', initMap);
            window.addEventListener('google-maps-auth-failure', handleAuthFailure);
            return () => {
                window.removeEventListener('google-maps-loaded', initMap);
                window.removeEventListener('google-maps-auth-failure', handleAuthFailure);
            };
        }
    }, [center]);

    // Clear existing overlay elements
    const clearOverlays = () => {
        markers.current.forEach((m) => {
            if (m.setMap) m.setMap(null);
            else m.map = null;
        });
        polylines.current.forEach((p) => p.setMap(null));
        markers.current = [];
        polylines.current = [];
    };

    useEffect(() => {
        if (!googleMap.current || !mapInitialized) return;
        
        if (selectedPath || allPaths.length > 0 || (explorerPath && explorerPath.length > 0)) {
            // A route exists, the other useEffect handles markers and fitBounds already.
            // But we can just trigger a slight zoom animation if needed, or let updateMarkers handle it.
        } else {
            // No route, center to Bangalore
            googleMap.current.panTo({ lat: 12.9716, lng: 77.5946 });
            googleMap.current.setZoom(12);
        }
    }, [recenterCount]);

    useEffect(() => {
        if (!googleMap.current || !mapInitialized) return;

        const SEGMENT_COLORS = [
            "#FF007F", // Neon Pink (Warm)
            "#00E5FF", // Cyan (Cold)
            "#70FF00", // Lime (Cold)
            "#FFD700", // Gold (Warm)
            "#BF00FF", // Purple (Cold)
            "#FF5F1F", // Blaze Orange (Warm)
        ];

        // Multi-path colors
        const PATH_COLORS = [
            "#8B5CF6", // Purple
            "#F97316", // Orange
            "#3B82F6", // Blue
        ];

        const EXPLORER_COLOR = "#22c55e"; // Neon Green

        const renderPath = async (path: PathResult, pathIdx: number, isSelected: boolean, isMuted: boolean = false) => {
            if (!googleMap.current) return;
            const pathBounds = new google.maps.LatLngBounds();
            let lastColorIdx = -1;
            
            const { AdvancedMarkerElement } = await (window as any).google.maps.importLibrary("marker");
            const { Polyline } = await (window as any).google.maps.importLibrary("maps");

            path.segments.forEach((seg, sIdx) => {
                const isWalking = seg.routeId === "WALKING";
                
                // 1. Color Selection with Neighbor Check
                let colorIdx = sIdx % SEGMENT_COLORS.length;
                const isWarm = (idx: number) => [0, 3, 5].includes(idx);
                
                if (sIdx > 0 && !isWalking && lastColorIdx !== -1) {
                    // Try to avoid back-to-back warm or back-to-back cold colors
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
                        pathBounds.extend(c);
                    }
                });

                // 2. Segment Outlining (Inline/Outline effect)
                if (!isWalking && isSelected && !isMuted) {
                    polylines.current.push(
                        new Polyline({
                            path: pathCoords,
                            strokeColor: "#000000",
                            strokeWeight: 14, // Thicker black background
                            strokeOpacity: 0.8,
                            zIndex: 140,
                            map: googleMap.current!,
                        })
                    );
                }

                polylines.current.push(
                    new Polyline({
                        path: pathCoords,
                        strokeColor: isWalking ? "#888888" : strokeColor,
                        strokeWeight: isSelected ? 8 : 4,
                        strokeOpacity: isWalking ? 0 : (isMuted ? 0.1 : (isSelected ? 1.0 : 0.4)),
                        zIndex: isSelected ? 150 : 100,
                        icons: isWalking ? [{
                            icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3, strokeColor: "#888888" },
                            offset: "0",
                            repeat: "10px",
                        }] : [],
                        map: googleMap.current!,
                    })
                );

                // 3. Transfer Nodes (Joint Markers)
                if (isSelected && sIdx < path.segments.length - 1 && !isMuted) {
                    const el = document.createElement("div");
                    el.style.width = "14px";
                    el.style.height = "14px";
                    el.style.backgroundColor = "#ffffff";
                    el.style.border = "4px solid #000000";
                    el.style.borderRadius = "50%";
                    el.style.boxSizing = "border-box";
                    
                    markers.current.push(
                        new AdvancedMarkerElement({
                            position: { lat: seg.toStopLat, lng: seg.toStopLon },
                            map: googleMap.current!,
                            content: el,
                            zIndex: 1000,
                            title: "Transfer Point",
                        })
                    );
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

                        markers.current.push(new AdvancedMarkerElement({
                            position: { lat: stop.stop_lat, lng: stop.stop_lon },
                            map: googleMap.current!,
                            content: el,
                        }));
                    });
                }
            });

            return pathBounds;
        };

        const updateMarkers = async () => {
            if (!googleMap.current) return;
            try {
                clearOverlays();
                const currentZoom = googleMap.current.getZoom() || 12;
                const bounds = googleMap.current.getBounds();
                
                const { AdvancedMarkerElement } = await (window as any).google.maps.importLibrary("marker");
                const { Polyline } = await (window as any).google.maps.importLibrary("maps");

                // 1. User Location Marker
                const userEl = document.createElement("div");
                userEl.style.width = "16px";
                userEl.style.height = "16px";
                userEl.style.backgroundColor = "#4f46e5";
                userEl.style.border = "3px solid #ffffff";
                userEl.style.borderRadius = "50%";
                userEl.style.boxShadow = "0 0 10px rgba(79,70,229,0.5)";
                
                new AdvancedMarkerElement({
                    position: center,
                    map: googleMap.current,
                    content: userEl,
                    title: "Your Location",
                    zIndex: 1000,
                });

            // 2. Render Explorer Path or Search Results
            const totalBounds = new google.maps.LatLngBounds();

            if (explorerPath && explorerPath.length > 0) {
                const pathCoords = explorerPath.map(s => ({ lat: s.stop_lat, lng: s.stop_lon }));
                pathCoords.forEach(c => totalBounds.extend(c));

                polylines.current.push(
                    new Polyline({
                        path: pathCoords,
                        strokeColor: EXPLORER_COLOR,
                        strokeWeight: 10,
                        strokeOpacity: 0.9,
                        zIndex: 1000,
                        map: googleMap.current!,
                    })
                );

                explorerPath.forEach(s => {
                    const el = document.createElement("div");
                    el.style.width = "12px";
                    el.style.height = "12px";
                    el.style.backgroundColor = EXPLORER_COLOR;
                    el.style.border = "2px solid #ffffff";
                    el.style.borderRadius = "50%";
                    el.style.boxSizing = "border-box";

                    markers.current.push(
                        new AdvancedMarkerElement({
                            position: { lat: s.stop_lat, lng: s.stop_lon },
                            map: googleMap.current!,
                            content: el,
                            title: s.stop_name,
                        })
                    );
                });

                // Also render search results but muted
                for (let idx = 0; idx < allPaths.length; idx++) {
                    await renderPath(allPaths[idx], idx, allPaths[idx] === selectedPath, true);
                }
            } else if (allPaths.length > 0) {
                // Sort to draw selected on top
                const sortedPaths = [...allPaths].sort((a, b) => {
                    if (a === selectedPath) return 1;
                    if (b === selectedPath) return -1;
                    return 0;
                });

                for (const path of sortedPaths) {
                    const isSelected = path === selectedPath;
                    const originalIdx = allPaths.indexOf(path);
                    const pathBounds = await renderPath(path, originalIdx, isSelected, false);
                    if (pathBounds && !pathBounds.isEmpty()) {
                        totalBounds.union(pathBounds);
                    }
                    
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
                            
                            markers.current.push(
                                new AdvancedMarkerElement({
                                    position: { lat: firstSeg.fromStopLat, lng: firstSeg.fromStopLon },
                                    map: googleMap.current!,
                                    content: originEl,
                                    zIndex: 2000,
                                    title: "Origin",
                                })
                            );
                        }

                        if (lastSeg.toStopLat && lastSeg.toStopLon) {
                            const destEl = document.createElement("div");
                            destEl.style.width = "18px";
                            destEl.style.height = "18px";
                            destEl.style.backgroundColor = "#A855F7";
                            destEl.style.border = "3px solid #ffffff";
                            destEl.style.borderRadius = "50%";
                            destEl.style.boxShadow = "0 0 10px rgba(168,85,247,0.8)";
                            
                            markers.current.push(
                                new AdvancedMarkerElement({
                                    position: { lat: lastSeg.toStopLat, lng: lastSeg.toStopLon },
                                    map: googleMap.current!,
                                    content: destEl,
                                    zIndex: 2000,
                                    title: "Destination",
                                })
                            );
                        }
                    }
                }
            }
            
            if (!totalBounds.isEmpty()) {
                 const shouldFitBounds = lastBoundsFit.current.selectedPath !== selectedPath || lastBoundsFit.current.recenterCount !== recenterCount;

                 if (shouldFitBounds) {
                     const isMobile = window.innerWidth < 768;
                     const bottomPadding = isMobile ? (window.innerHeight * 0.7) + 20 : 80;
                     const rightPadding = isMobile ? 20 : 450;
                     
                     googleMap.current.fitBounds(totalBounds, { 
                         top: 60, 
                         right: rightPadding, 
                         bottom: bottomPadding, 
                         left: 20 
                     });
                     
                     // Safety to prevent zooming out too much
                     google.maps.event.addListenerOnce(googleMap.current, 'bounds_changed', () => {
                         const z = googleMap.current!.getZoom();
                         if (z !== undefined && z < 11) googleMap.current!.setZoom(11);
                         if (z !== undefined && z > 15) googleMap.current!.setZoom(14);
                     });

                     lastBoundsFit.current = { selectedPath, recenterCount: recenterCount || 0 };
                 }
            } else if (currentZoom > 15 && bounds) {
                // 3. Show nearby stops
                stops.forEach((stop) => {
                    const latLng = { lat: stop.stop_lat, lng: stop.stop_lon };
                    if (bounds.contains(latLng)) {
                        const el = document.createElement("div");
                        el.style.width = "8px";
                        el.style.height = "8px";
                        el.style.backgroundColor = stop.line_code === "BUS" ? "rgba(59,130,246,0.6)" : "rgba(168,85,247,0.6)";
                        el.style.border = "1px solid rgba(255,255,255,0.8)";
                        el.style.borderRadius = "50%";
                        
                        const marker = new AdvancedMarkerElement({
                            position: latLng,
                            map: googleMap.current,
                            content: el,
                        });
                        marker.addListener("click", () => onStopSelect?.(stop));
                        markers.current.push(marker);
                    }
                });
            }
            } catch (err: any) {
                console.error("Error updating markers:", err);
                // Continue with partial rendering rather than failing completely
            }
        };

        let debounceTimer: any;
        const debouncedUpdate = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(updateMarkers, 100);
        };

        updateMarkers(); // Initial call
        const zoomListener = googleMap.current.addListener("zoom_changed", debouncedUpdate);
        const idleListener = googleMap.current.addListener("idle", debouncedUpdate);
        
        return () => {
            google.maps.event.removeListener(zoomListener);
            google.maps.event.removeListener(idleListener);
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
        <div
            ref={mapRef}
            className="w-full h-full min-h-[500px] rounded-[24px] overflow-hidden bg-[#1e1e1e]"
        />
    );
}
