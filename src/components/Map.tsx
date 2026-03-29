/// <reference types="@types/google.maps" />
import { useEffect, useRef } from "react";
import mapStyles from "../assets/MapStyles.json";
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
    const markers = useRef<google.maps.Marker[]>([]);
    const polylines = useRef<google.maps.Polyline[]>([]);

    useEffect(() => {
        if (mapRef.current && !googleMap.current) {
            googleMap.current = new google.maps.Map(mapRef.current, {
                center,
                zoom: 12,
                styles: mapStyles as google.maps.MapTypeStyle[],
                disableDefaultUI: true,
                backgroundColor: "#121212",
                gestureHandling: "greedy",
            });
        }
    }, [center]);

    // Clear existing overlay elements
    const clearOverlays = () => {
        markers.current.forEach((m) => m.setMap(null));
        polylines.current.forEach((p) => p.setMap(null));
        markers.current = [];
        polylines.current = [];
    };

    useEffect(() => {
        if (!googleMap.current) return;
        // Only auto-center if no path is being viewed
        if (!selectedPath) {
            googleMap.current.panTo(center);
            googleMap.current.setZoom(15);
        }
    }, [allPaths, explorerPath, selectedPath, recenterCount]);

    useEffect(() => {
        if (!googleMap.current) return;

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

        const renderPath = (path: PathResult, pathIdx: number, isSelected: boolean, isMuted: boolean = false) => {
            if (!googleMap.current) return;
            const pathBounds = new google.maps.LatLngBounds();
            let lastColorIdx = -1;
            
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

                pathCoords.forEach((c) => pathBounds.extend(c));

                // 2. Segment Outlining (Inline/Outline effect)
                if (!isWalking && isSelected && !isMuted) {
                    polylines.current.push(
                        new google.maps.Polyline({
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
                    new google.maps.Polyline({
                        path: pathCoords,
                        strokeColor,
                        strokeWeight: isSelected ? 8 : 4,
                        strokeOpacity: isWalking ? 0 : (isMuted ? 0.1 : (isSelected ? 1.0 : 0.4)),
                        zIndex: isSelected ? 150 : 100,
                        icons: isWalking ? [{
                            icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 5, strokeColor: "#ffffff" },
                            repeat: "25px",
                        }] : [],
                        map: googleMap.current!,
                    })
                );

                // 3. Transfer Nodes (Joint Markers)
                if (isSelected && sIdx < path.segments.length - 1 && !isMuted) {
                    markers.current.push(
                        new google.maps.Marker({
                            position: { lat: seg.toStopLat, lng: seg.toStopLon },
                            map: googleMap.current!,
                            icon: {
                                path: google.maps.SymbolPath.CIRCLE,
                                fillColor: "#ffffff",
                                fillOpacity: 1,
                                scale: 7,
                                strokeWeight: 4,
                                strokeColor: "#000000",
                            },
                            zIndex: 1000,
                            title: "Transfer Point",
                        })
                    );
                }

                // Markers for internal stops (only if selected)
                if (isSelected && seg.stops && !isMuted) {
                   seg.stops.forEach((stop) => {
                        markers.current.push(new google.maps.Marker({
                            position: { lat: stop.stop_lat, lng: stop.stop_lon },
                            map: googleMap.current!,
                            icon: {
                                path: google.maps.SymbolPath.CIRCLE,
                                fillColor: strokeColor,
                                fillOpacity: 1,
                                scale: 5,
                                strokeWeight: 2,
                                strokeColor: "#000000",
                            },
                        }));
                    });
                }
            });

            return pathBounds;
        };

        const updateMarkers = () => {
            if (!googleMap.current) return;
            clearOverlays();
            const currentZoom = googleMap.current.getZoom() || 12;
            const bounds = googleMap.current.getBounds();

            // 1. User Location Marker
            new google.maps.Marker({
                position: center,
                map: googleMap.current,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    fillColor: "#4f46e5",
                    fillOpacity: 1,
                    scale: 8,
                    strokeWeight: 3,
                    strokeColor: "#fff",
                },
                title: "Your Location",
                zIndex: 1000,
            });

            // 2. Render Explorer Path or Search Results
            const totalBounds = new google.maps.LatLngBounds();

            if (explorerPath && explorerPath.length > 0) {
                const pathCoords = explorerPath.map(s => ({ lat: s.stop_lat, lng: s.stop_lon }));
                pathCoords.forEach(c => totalBounds.extend(c));

                polylines.current.push(
                    new google.maps.Polyline({
                        path: pathCoords,
                        strokeColor: EXPLORER_COLOR,
                        strokeWeight: 10,
                        strokeOpacity: 0.9,
                        zIndex: 1000,
                        map: googleMap.current!,
                    })
                );

                explorerPath.forEach(s => {
                    markers.current.push(
                        new google.maps.Marker({
                            position: { lat: s.stop_lat, lng: s.stop_lon },
                            map: googleMap.current!,
                            icon: {
                                path: google.maps.SymbolPath.CIRCLE,
                                fillColor: EXPLORER_COLOR,
                                fillOpacity: 1,
                                scale: 6,
                                strokeWeight: 2,
                                strokeColor: "#ffffff",
                            },
                            title: s.stop_name,
                        })
                    );
                });

                // Also render search results but muted
                allPaths.forEach((path, idx) => {
                    renderPath(path, idx, path === selectedPath, true);
                });
            } else if (allPaths.length > 0) {
                // Sort to draw selected on top
                const sortedPaths = [...allPaths].sort((a, b) => {
                    if (a === selectedPath) return 1;
                    if (b === selectedPath) return -1;
                    return 0;
                });

                sortedPaths.forEach((path) => {
                    const isSelected = path === selectedPath;
                    const originalIdx = allPaths.indexOf(path);
                    const pathBounds = renderPath(path, originalIdx, isSelected, false);
                    if (pathBounds && !pathBounds.isEmpty()) {
                        totalBounds.union(pathBounds);
                    }
                });
            }
            
            if (!totalBounds.isEmpty()) {
                 googleMap.current.fitBounds(totalBounds, { top: 80, right: 450, bottom: 80, left: 80 });
            } else if (currentZoom > 15 && bounds) {
                // 3. Show nearby stops
                stops.forEach((stop) => {
                    const latLng = { lat: stop.stop_lat, lng: stop.stop_lon };
                    if (bounds.contains(latLng)) {
                        const marker = new google.maps.Marker({
                            position: latLng,
                            map: googleMap.current,
                            icon: {
                                path: google.maps.SymbolPath.CIRCLE,
                                fillColor: stop.line_code === "BUS" ? "#3b82f6" : "#a855f7",
                                fillOpacity: 0.6,
                                scale: 4,
                                strokeWeight: 1,
                                strokeColor: "#fff",
                            },
                        });
                        marker.addListener("click", () => onStopSelect?.(stop));
                        markers.current.push(marker);
                    }
                });
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
    }, [stops, selectedPath, allPaths, explorerPath, onStopSelect, center, recenterCount]);

    return (
        <div
            ref={mapRef}
            className="w-full h-full min-h-[500px] rounded-2xl overflow-hidden shadow-2xl"
        />
    );
}
