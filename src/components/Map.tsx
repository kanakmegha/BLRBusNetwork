/// <reference types="@types/google.maps" />
import { useEffect, useRef } from "react";
import mapStyles from "../assets/MapStyles.json";
import type { PathResult, Stop } from "../engine/types";

interface MapProps {
    stops: Stop[];
    selectedPath?: PathResult | null;
    onStopSelect?: (stop: Stop) => void;
    center?: { lat: number; lng: number };
}

export function Map(
    {
        stops,
        selectedPath,
        onStopSelect,
        center = { lat: 12.9716, lng: 77.5946 },
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
    }, [center, selectedPath]);

    useEffect(() => {
        if (!googleMap.current) return;

        const SEGMENT_COLORS = [
            "#ef4444",
            "#3b82f6",
            "#10b981",
            "#f59e0b",
            "#8b5cf6",
            "#ec4899",
        ];

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
            }).setMap(googleMap.current);

            // 2. If path selected, show path details
            if (selectedPath) {
                const pathBounds = new google.maps.LatLngBounds();
                selectedPath.segments.forEach((seg, sIdx) => {
                    const isWalking = seg.routeId === "WALKING";
                    const color = isWalking
                        ? "#ffffff"
                        : SEGMENT_COLORS[sIdx % SEGMENT_COLORS.length];

                    const pathCoords = seg.stops && seg.stops.length > 0
                        ? seg.stops.map((s) => ({
                            lat: s.stop_lat,
                            lng: s.stop_lon,
                        }))
                        : [
                            { lat: seg.fromStopLat, lng: seg.fromStopLon },
                            { lat: seg.toStopLat, lng: seg.toStopLon },
                        ];

                    pathCoords.forEach((c) => pathBounds.extend(c));

                    console.log(`Map: Rendering segment ${sIdx}`, {
                        routeId: seg.routeId,
                        isWalking,
                        stops: seg.stops?.length,
                        pathCoords: pathCoords.length
                    });

                    polylines.current.push(
                        new google.maps.Polyline({
                            path: pathCoords,
                            strokeColor: color,
                            strokeWeight: 8,
                            strokeOpacity: isWalking ? 0 : 0.9,
                            zIndex: 100,
                            icons: isWalking
                                ? [{
                                    icon: {
                                        path: "M 0,-1 0,1",
                                        strokeOpacity: 1,
                                        scale: 5,
                                        strokeColor: "#ffffff",
                                    },
                                    repeat: "25px",
                                }]
                                : [],
                            map: googleMap.current!,
                        }),
                    );

                    // Intermediate stops for this segment
                    if (seg.stops) {
                        seg.stops.forEach((stop) => {
                            const marker = new google.maps.Marker({
                                position: {
                                    lat: stop.stop_lat,
                                    lng: stop.stop_lon,
                                },
                                map: googleMap.current!,
                                icon: {
                                    path: google.maps.SymbolPath.CIRCLE,
                                    fillColor: color,
                                    fillOpacity: 1,
                                    scale: 5,
                                    strokeWeight: 2,
                                    strokeColor: "#1e1e1e",
                                },
                                title: `${stop.stop_name}${
                                    isWalking ? "" : "\nRoutes: " +
                                        (stop.busNumbers?.join(", ") ||
                                            "N/A")
                                }`,
                            });
                            markers.current.push(marker);
                        });
                    }
                });
                if (!pathBounds.isEmpty()) {
                    googleMap.current.fitBounds(pathBounds, 50);
                }
            } else if (currentZoom > 15 && bounds) {
                // 3. Show nearby stops only when zoomed in and within viewport
                stops.forEach((stop) => {
                    const latLng = { lat: stop.stop_lat, lng: stop.stop_lon };
                    if (bounds.contains(latLng)) {
                        const marker = new google.maps.Marker({
                            position: latLng,
                            map: googleMap.current,
                            icon: {
                                path: google.maps.SymbolPath.CIRCLE,
                                fillColor: stop.line_code === "BUS"
                                    ? "#3b82f6"
                                    : "#a855f7",
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
        const zoomListener = googleMap.current.addListener(
            "zoom_changed",
            debouncedUpdate,
        );
        const idleListener = googleMap.current.addListener(
            "idle",
            debouncedUpdate,
        );
        return () => {
            google.maps.event.removeListener(zoomListener);
            google.maps.event.removeListener(idleListener);
            clearTimeout(debounceTimer);
        };
    }, [stops, selectedPath, onStopSelect, center]);

    return (
        <div
            ref={mapRef}
            className="w-full h-full min-h-[400px] rounded-2xl overflow-hidden shadow-2xl"
        />
    );
}
