/// <reference types="@types/google.maps" />
import { getActiveProvider, getPreferredProvider, loadMapProvider, markProviderFailed } from "./mapLoader";
import type { MapProviderType } from "./mapLoader";

export interface Stop {
    stop_id: string;
    stop_name: string;
    stop_lat: number;
    stop_lon: number;
    line_code?: string;
    busNumbers?: string[];
}

export interface AutosuggestSuggestion {
    placeId: string;
    description: string;
    mainText: string;
    secondaryText: string;
    isLocalStop?: boolean;
    stop?: Stop;
}

export interface PlaceDetails {
    placeId: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
}

export interface IMapInstance {
    panTo(lat: number, lng: number): void;
    setZoom(zoom: number): void;
    getZoom(): number | undefined;
    getBounds(): { contains: (latLng: { lat: number; lng: number }) => boolean } | null;
    fitBounds(latLngs: { lat: number; lng: number }[], padding?: { top: number; right: number; bottom: number; left: number }): void;
    clearOverlays(): void;
    addMarker(options: {
        position: { lat: number; lng: number };
        title?: string;
        html?: string | HTMLElement;
        onClick?: () => void;
        zIndex?: number;
    }): any;
    addPolyline(options: {
        path: { lat: number; lng: number }[];
        strokeColor: string;
        strokeWeight: number;
        strokeOpacity: number;
        zIndex?: number;
        dashed?: boolean;
    }): any;
    addListener(event: "zoom_changed" | "idle" | "click" | "dragstart", callback: () => void): () => void;
}

export interface IMapRenderProvider {
    initializeMap(container: HTMLDivElement, options: {
        center: { lat: number; lng: number };
        zoom: number;
        minZoom?: number;
        maxZoom?: number;
        bounds?: { north: number; south: number; east: number; west: number };
        mapId?: string;
        onInteract?: () => void;
    }): Promise<IMapInstance>;
    destroyMap(): void;
}

export interface ISearchProvider {
    autosuggest(query: string): Promise<AutosuggestSuggestion[]>;
}

export interface IGeocodingProvider {
    geocode(placeId: string, address?: string): Promise<{ lat: number; lng: number } | null>;
    reverseGeocode(lat: number, lng: number): Promise<string | null>;
    getPlaceDetails(placeId: string): Promise<PlaceDetails | null>;
}

export interface IRoutingProvider {
    calculateRoute(origin: { lat: number; lng: number }, destination: { lat: number; lng: number }): Promise<any>;
}

export interface IFullMapProvider extends IMapRenderProvider, ISearchProvider, IGeocodingProvider, IRoutingProvider {}

// ----------------------------------------------------
// 1. GOOGLE MAPS PROVIDER IMPLEMENTATION
// ----------------------------------------------------
class GoogleMapProvider implements IFullMapProvider {
    private overlays: any[] = [];
    private container: HTMLDivElement | null = null;

    async initializeMap(container: HTMLDivElement, options: any): Promise<IMapInstance> {
        this.destroyMap();
        this.container = container;

        const mapOptions: google.maps.MapOptions = {
            center: options.center,
            zoom: options.zoom,
            minZoom: options.minZoom || 10,
            maxZoom: options.maxZoom || 18,
            disableDefaultUI: true,
            backgroundColor: "#121212",
            gestureHandling: "greedy",
            colorScheme: "DARK",
        };

        if (options.bounds) {
            mapOptions.restriction = {
                latLngBounds: {
                    north: options.bounds.north,
                    south: options.bounds.south,
                    east: options.bounds.east,
                    west: options.bounds.west,
                },
                strictBounds: false,
            };
        }

        // Avoid styles property warning when mapId is present
        if (options.mapId && options.mapId !== "DEMO_MAP_ID") {
            mapOptions.mapId = options.mapId;
        } else {
            // Dark mode fallbacks
            mapOptions.styles = [
                { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
                { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
                { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
                { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] }
            ];
        }

        const { Map } = await (window as any).google.maps.importLibrary("maps");
        const mapObj = new Map(container, mapOptions);

        const provider = this;
        return {
            panTo(lat, lng) {
                mapObj.panTo({ lat, lng });
            },
            setZoom(zoom) {
                mapObj.setZoom(zoom);
            },
            getZoom() {
                return mapObj.getZoom();
            },
            getBounds() {
                const b = mapObj.getBounds();
                if (!b) return null;
                return {
                    contains(latLng) {
                        return b.contains(latLng);
                    }
                };
            },
            fitBounds(latLngs, padding) {
                const bounds = new google.maps.LatLngBounds();
                latLngs.forEach(p => bounds.extend(p));
                
                const formatPadding: any = padding ? {
                    top: padding.top,
                    right: padding.right,
                    bottom: padding.bottom,
                    left: padding.left
                } : 40;

                mapObj.fitBounds(bounds, formatPadding);
            },
            clearOverlays() {
                provider.overlays.forEach(o => {
                    if (o.setMap) o.setMap(null);
                    else o.map = null;
                });
                provider.overlays = [];
            },
            addMarker(markerOptions) {
                if (markerOptions.html && (window as any).google.maps.marker) {
                    let contentNode: any = markerOptions.html;
                    if (typeof markerOptions.html === "string") {
                        const div = document.createElement("div");
                        div.innerHTML = markerOptions.html.trim();
                        contentNode = div.firstChild;
                    }
                    
                    const m = new (window as any).google.maps.marker.AdvancedMarkerElement({
                        map: mapObj,
                        position: markerOptions.position,
                        content: contentNode,
                        title: markerOptions.title,
                        zIndex: markerOptions.zIndex,
                    });
                    
                    if (markerOptions.onClick) {
                        m.addListener("click", markerOptions.onClick);
                    }
                    
                    provider.overlays.push(m);
                    return m;
                } else {
                    const m = new google.maps.Marker({
                        map: mapObj,
                        position: markerOptions.position,
                        title: markerOptions.title,
                        zIndex: markerOptions.zIndex,
                    });

                    if (markerOptions.onClick) {
                        m.addListener("click", markerOptions.onClick);
                    }

                    provider.overlays.push(m);
                    return m;
                }
            },
            addPolyline(polylineOptions) {
                const p = new google.maps.Polyline({
                    map: mapObj,
                    path: polylineOptions.path,
                    strokeColor: polylineOptions.strokeColor,
                    strokeWeight: polylineOptions.strokeWeight,
                    strokeOpacity: polylineOptions.strokeOpacity,
                    zIndex: polylineOptions.zIndex,
                    icons: polylineOptions.dashed ? [{
                        icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3, strokeColor: polylineOptions.strokeColor },
                        offset: "0",
                        repeat: "10px",
                    }] : [],
                });
                provider.overlays.push(p);
                return p;
            },
            addListener(event, callback) {
                const listener = mapObj.addListener(event, callback);
                return () => {
                    google.maps.event.removeListener(listener);
                };
            }
        };
    }

    destroyMap(): void {
        this.overlays.forEach(o => {
            if (o.setMap) o.setMap(null);
            else o.map = null;
        });
        this.overlays = [];
        if (this.container) {
            this.container.innerHTML = "";
            this.container = null;
        }
    }

    async autosuggest(query: string): Promise<AutosuggestSuggestion[]> {
        const { AutocompleteSessionToken, AutocompleteSuggestion } = await (window as any).google.maps.importLibrary("places");
        const token = new AutocompleteSessionToken();
        const request = {
            input: query,
            sessionToken: token,
            includedRegionCodes: ["IN"],
            locationRestriction: {
                north: 13.5,
                south: 12.5,
                east: 78.0,
                west: 77.0
            }
        };
        const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
        return suggestions.map((s: any) => ({
            placeId: s.placePrediction.placeId,
            description: s.placePrediction.text.text,
            mainText: s.placePrediction.text.text,
            secondaryText: ""
        }));
    }

    async geocode(placeId: string, address?: string): Promise<{ lat: number; lng: number } | null> {
        const { Geocoder } = await (window as any).google.maps.importLibrary("geocoding");
        const geocoder = new Geocoder();
        return new Promise((resolve) => {
            const req = placeId ? { placeId } : { address };
            geocoder.geocode(req, (results: any, status: any) => {
                if (status === "OK" && results && results[0]) {
                    const loc = results[0].geometry.location;
                    resolve({ lat: loc.lat(), lng: loc.lng() });
                } else {
                    resolve(null);
                }
            });
        });
    }

    async reverseGeocode(lat: number, lng: number): Promise<string | null> {
        const { Geocoder } = await (window as any).google.maps.importLibrary("geocoding");
        const geocoder = new Geocoder();
        return new Promise((resolve) => {
            geocoder.geocode({ location: { lat, lng } }, (results: any, status: any) => {
                if (status === "OK" && results && results[0]) {
                    resolve(results[0].formatted_address);
                } else {
                    resolve(null);
                }
            });
        });
    }

    async getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
        const coords = await this.geocode(placeId);
        if (!coords) return null;
        const address = await this.reverseGeocode(coords.lat, coords.lng);
        return {
            placeId,
            name: address ? address.split(",")[0] : "Selected Location",
            address: address || "",
            lat: coords.lat,
            lng: coords.lng
        };
    }

    async calculateRoute(origin: any, destination: any): Promise<any> {
        const directionsService = new google.maps.DirectionsService();
        return new Promise((resolve, reject) => {
            directionsService.route({
                origin,
                destination,
                travelMode: google.maps.TravelMode.WALKING
            }, (res: any, status: any) => {
                if (status === "OK") resolve(res);
                else reject(status);
            });
        });
    }
}

// ----------------------------------------------------
// 2. MAPMYINDIA (MAPPLS) PROVIDER IMPLEMENTATION
// ----------------------------------------------------
class MapplsMapProvider implements IFullMapProvider {
    private activeMap: any = null;
    private overlays: any[] = [];

    async initializeMap(container: HTMLDivElement, options: any): Promise<IMapInstance> {
        this.destroyMap();

        const mapOptions = {
            center: [options.center.lat, options.center.lng],
            zoom: options.zoom,
            zoomControl: false,
            hybrid: false
        };

        const mapObj = new (window as any).mappls.Map(container, mapOptions);
        this.activeMap = mapObj;

        const provider = this;
        return {
            panTo(lat, lng) {
                mapObj.panTo({ lat, lng });
            },
            setZoom(zoom) {
                mapObj.setZoom(zoom);
            },
            getZoom() {
                return mapObj.getZoom();
            },
            getBounds() {
                const b = mapObj.getBounds();
                if (!b) return null;
                return {
                    contains(latLng) {
                        const lat = latLng.lat;
                        const lng = latLng.lng;
                        if (Array.isArray(b)) {
                            return lat >= b[0][0] && lat <= b[1][0] && lng >= b[0][1] && lng <= b[1][1];
                        }
                        if (b.getSouth && b.getNorth) {
                            return lat >= b.getSouth() && lat <= b.getNorth() && lng >= b.getWest() && lng <= b.getEast();
                        }
                        return false;
                    }
                };
            },
            fitBounds(latLngs, padding) {
                if (latLngs.length === 0) return;
                let minLat = Infinity, maxLat = -Infinity;
                let minLng = Infinity, maxLng = -Infinity;
                latLngs.forEach(p => {
                    if (p.lat < minLat) minLat = p.lat;
                    if (p.lat > maxLat) maxLat = p.lat;
                    if (p.lng < minLng) minLng = p.lng;
                    if (p.lng > maxLng) maxLng = p.lng;
                });
                
                mapObj.fitBounds([[minLat, minLng], [maxLat, maxLng]], {
                    padding: padding ? padding.top || 40 : 40,
                    animate: true
                });
            },
            clearOverlays() {
                provider.overlays.forEach(o => {
                    if (o.remove) o.remove();
                    else if (o.setMap) o.setMap(null);
                });
                provider.overlays = [];
            },
            addMarker(markerOptions) {
                const markerConfig: any = {
                    map: mapObj,
                    position: markerOptions.position,
                    title: markerOptions.title,
                };

                if (markerOptions.html) {
                    if (typeof markerOptions.html === "string") {
                        markerConfig.html = markerOptions.html;
                    } else {
                        markerConfig.html = markerOptions.html.outerHTML;
                    }
                }

                const m = new (window as any).mappls.Marker(markerConfig);
                
                if (markerOptions.onClick && m.addListener) {
                    m.addListener("click", markerOptions.onClick);
                }

                provider.overlays.push(m);
                return m;
            },
            addPolyline(polylineOptions) {
                const p = new (window as any).mappls.Polyline({
                    map: mapObj,
                    path: polylineOptions.path,
                    strokeColor: polylineOptions.strokeColor,
                    strokeWeight: polylineOptions.strokeWeight,
                    strokeOpacity: polylineOptions.strokeOpacity,
                });
                provider.overlays.push(p);
                return p;
            },
            addListener(event, callback) {
                mapObj.addListener(event, callback);
                return () => {
                    if (mapObj.removeListener) {
                        mapObj.removeListener(event, callback);
                    }
                };
            }
        };
    }

    destroyMap(): void {
        this.overlays.forEach(o => {
            if (o.remove) o.remove();
        });
        this.overlays = [];
        if (this.activeMap && this.activeMap.remove) {
            try {
                this.activeMap.remove();
            } catch (e) {}
        }
        this.activeMap = null;
    }

    async autosuggest(query: string): Promise<AutosuggestSuggestion[]> {
        const apiKey = import.meta.env.VITE_MAPMYINDIA_API_KEY;
        const url = `https://atlas.mappls.com/api/places/autosuggest/json?query=${encodeURIComponent(query)}&access_token=${apiKey}&setLocation=12.9716,77.5946&zoom=12`;
        
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data && data.suggestedLocations) {
                return data.suggestedLocations.map((s: any) => ({
                    placeId: s.eloc || s.mapplsPin,
                    description: `${s.placeName}, ${s.placeAddress || ""}`,
                    mainText: s.placeName,
                    secondaryText: s.placeAddress || ""
                }));
            }
            return [];
        } catch (e) {
            console.error("Mappls Autosuggest fetch failed:", e);
            return [];
        }
    }

    async geocode(placeId: string, address?: string): Promise<{ lat: number; lng: number } | null> {
        const apiKey = import.meta.env.VITE_MAPMYINDIA_API_KEY;
        if (placeId) {
            const url = `https://atlas.mappls.com/api/places/detail/json?eloc=${placeId}&access_token=${apiKey}`;
            try {
                const res = await fetch(url);
                const data = await res.json();
                if (data && data.latitude && data.longitude) {
                    return {
                        lat: parseFloat(data.latitude),
                        lng: parseFloat(data.longitude)
                    };
                }
            } catch (e) {
                console.error("Mappls Place Detail geocoding failed:", e);
            }
        }
        
        if (address) {
            const url = `https://atlas.mappls.com/api/places/geocode/json?address=${encodeURIComponent(address)}&access_token=${apiKey}`;
            try {
                const res = await fetch(url);
                const data = await res.json();
                if (data && data.copResults && data.copResults[0]) {
                    const r = data.copResults[0];
                    return {
                        lat: parseFloat(r.latitude),
                        lng: parseFloat(r.longitude)
                    };
                }
            } catch (e) {
                console.error("Mappls Geocode failed:", e);
            }
        }
        return null;
    }

    async reverseGeocode(lat: number, lng: number): Promise<string | null> {
        const apiKey = import.meta.env.VITE_MAPMYINDIA_API_KEY;
        const url = `https://atlas.mappls.com/api/places/rev_geocode/json?lat=${lat}&lng=${lng}&access_token=${apiKey}`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data && data.results && data.results[0]) {
                return data.results[0].formatted_address;
            }
        } catch (e) {
            console.error("Mappls Reverse Geocode failed:", e);
        }
        return null;
    }

    async getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
        const apiKey = import.meta.env.VITE_MAPMYINDIA_API_KEY;
        const url = `https://atlas.mappls.com/api/places/detail/json?eloc=${placeId}&access_token=${apiKey}`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data && data.latitude && data.longitude) {
                return {
                    placeId,
                    name: data.placeName || "Selected Location",
                    address: data.placeAddress || "",
                    lat: parseFloat(data.latitude),
                    lng: parseFloat(data.longitude)
                };
            }
        } catch (e) {
            console.error("Mappls Get Place Details failed:", e);
        }
        return null;
    }

    async calculateRoute(origin: any, destination: any): Promise<any> {
        const apiKey = import.meta.env.VITE_MAPMYINDIA_API_KEY;
        const url = `https://apis.mappls.com/advancedmaps/v1/${apiKey}/route_adv/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
        try {
            const res = await fetch(url);
            return await res.json();
        } catch (e) {
            console.error("Mappls calculateRoute failed:", e);
            return null;
        }
    }
}

// ----------------------------------------------------
// 3. LEAFLET + CARTO DARK MATTER PROVIDER IMPLEMENTATION
// ----------------------------------------------------
// Note on CARTO basemaps: CARTO Dark Matter raster tiles are free for
// non-commercial and low-to-moderate traffic usage with OSM + CARTO attribution.
// High-volume commercial deployments require a commercial tile plan.
// Note on Nominatim: Public Nominatim enforces a strict max 1 req/sec policy.
class LeafletMapProvider implements IFullMapProvider {
    private activeMap: any = null;
    private container: HTMLDivElement | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private wheelCleanup: (() => void) | null = null;
    private overlays: any[] = [];
    private cachedSuggestions: Record<string, { lat: number; lng: number }> = {};
    private geocodeCache: Record<string, { lat: number; lng: number }> = {};
    private reverseGeocodeCache: Record<string, string> = {};
    private lastNominatimRequestAt = 0;

    private async throttleNominatim(): Promise<void> {
        const now = Date.now();
        const elapsed = now - this.lastNominatimRequestAt;
        if (elapsed < 1050) {
            await new Promise((r) => setTimeout(r, 1050 - elapsed));
        }
        this.lastNominatimRequestAt = Date.now();
    }

    private parseHtmlDimensions(html: string | HTMLElement): [number, number] {
        if (typeof html !== "string") {
            const w = parseInt(html.style?.width || "", 10);
            const h = parseInt(html.style?.height || "", 10);
            if (!Number.isNaN(w) && !Number.isNaN(h) && w > 0 && h > 0) {
                return [w, h];
            }
            return [16, 16];
        }
        const wMatch = html.match(/width\s*:\s*(\d+)px/i);
        const hMatch = html.match(/height\s*:\s*(\d+)px/i);
        const w = wMatch ? parseInt(wMatch[1], 10) : 16;
        const h = hMatch ? parseInt(hMatch[1], 10) : 16;
        return [w > 0 ? w : 16, h > 0 ? h : 16];
    }

    async initializeMap(container: HTMLDivElement, options: any): Promise<IMapInstance> {
        this.destroyMap();
        this.container = container;
        container.innerHTML = "";

        const L = (window as any).L;
        const mapOptions: any = {
            zoomControl: false,
            minZoom: options.minZoom || 10,
            maxZoom: options.maxZoom || 18,
            dragging: true,
            touchZoom: true,
            // Handled by custom trackpad/pinch/mouse-wheel gesture handler below
            scrollWheelZoom: false,
            doubleClickZoom: true,
            boxZoom: true,
        };

        if (options.bounds) {
            // Apply a generous buffer around the city bounds so desktop viewports at zoom 10-12
            // can still pan smoothly without hitting a tight viewport-edge lock.
            const latBuffer = 0.25;
            const lngBuffer = 0.25;
            mapOptions.maxBounds = L.latLngBounds(
                [options.bounds.south - latBuffer, options.bounds.west - lngBuffer],
                [options.bounds.north + latBuffer, options.bounds.east + lngBuffer]
            );
            mapOptions.maxBoundsViscosity = 0.5;
        }

        const mapObj = L.map(container, mapOptions).setView([options.center.lat, options.center.lng], options.zoom);

        const cartoApiKey = (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_CARTO_BASEMAPS_API_KEY)
            ? String((import.meta as any).env.VITE_CARTO_BASEMAPS_API_KEY).trim()
            : "";
        const keySuffix = cartoApiKey ? `?key=${encodeURIComponent(cartoApiKey)}` : "";
        const baseTileUrl = `https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png${keySuffix}`;
        const labelsTileUrl = `https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png${keySuffix}`;

        L.tileLayer(baseTileUrl, {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20,
            detectRetina: true
        }).addTo(mapObj);

        // Render native CARTO dark_only_labels in a dedicated pane above routes (400) and below markers (600)
        let labelsPaneName: string | undefined;
        if (typeof mapObj.createPane === "function") {
            const labelsPane = mapObj.createPane("carto-labels");
            labelsPane.style.zIndex = "450";
            labelsPane.style.pointerEvents = "none";
            if (labelsPane.classList) {
                labelsPane.classList.add("carto-labels-pane");
            }
            labelsPaneName = "carto-labels";
        }

        L.tileLayer(labelsTileUrl, {
            subdomains: 'abcd',
            maxZoom: 20,
            detectRetina: true,
            ...(labelsPaneName ? { pane: labelsPaneName } : {}),
        }).addTo(mapObj);

        // Custom gesture handler:
        // - Two-finger trackpad scroll -> pan (panBy)
        // - Trackpad pinch (ctrlKey=true) -> zoom around pointer
        // - Physical mouse wheel (discrete vertical notched deltas) -> zoom around pointer
        let lastTrackpadPanAt = 0;
        let lastWheelZoomAt = 0;
        let pinchAccum = 0;

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            e.stopPropagation();

            const now = Date.now();

            if (e.ctrlKey) {
                pinchAccum += e.deltaY;
                if (Math.abs(pinchAccum) >= 12 && now - lastWheelZoomAt >= 60) {
                    const rect = container.getBoundingClientRect ? container.getBoundingClientRect() : { left: 0, top: 0 };
                    const point = typeof L.point === "function"
                        ? L.point(e.clientX - rect.left, e.clientY - rect.top)
                        : [e.clientX - rect.left, e.clientY - rect.top];
                    const step = pinchAccum < 0 ? 1 : -1;
                    if (typeof mapObj.setZoomAround === "function") {
                        mapObj.setZoomAround(point, mapObj.getZoom() + step, { animate: true });
                    } else {
                        mapObj.setZoom(mapObj.getZoom() + step);
                    }
                    pinchAccum = 0;
                    lastWheelZoomAt = now;
                }
                return;
            }

            const isTrackpadStream = now - lastTrackpadPanAt < 250;
            const looksLikeTrackpad =
                e.deltaX !== 0 ||
                (e.deltaMode === 0 && (Math.abs(e.deltaY) < 40 || !Number.isInteger(e.deltaY)));

            if (looksLikeTrackpad || isTrackpadStream) {
                lastTrackpadPanAt = now;
                if (typeof mapObj.panBy === "function") {
                    mapObj.panBy([e.deltaX, e.deltaY], { animate: false });
                }
                return;
            }

            if (now - lastWheelZoomAt >= 80 && e.deltaY !== 0) {
                const rect = container.getBoundingClientRect ? container.getBoundingClientRect() : { left: 0, top: 0 };
                const point = typeof L.point === "function"
                    ? L.point(e.clientX - rect.left, e.clientY - rect.top)
                    : [e.clientX - rect.left, e.clientY - rect.top];
                const step = e.deltaY < 0 ? 1 : -1;
                if (typeof mapObj.setZoomAround === "function") {
                    mapObj.setZoomAround(point, mapObj.getZoom() + step, { animate: true });
                } else {
                    mapObj.setZoom(mapObj.getZoom() + step);
                }
                lastWheelZoomAt = now;
            }
        };

        if (typeof container.addEventListener === "function") {
            container.addEventListener("wheel", onWheel, { passive: false });
            this.wheelCleanup = () => {
                container.removeEventListener("wheel", onWheel);
            };
        }

        if (typeof ResizeObserver !== "undefined") {
            this.resizeObserver = new ResizeObserver(() => {
                if (this.activeMap && typeof this.activeMap.invalidateSize === "function") {
                    this.activeMap.invalidateSize();
                }
            });
            this.resizeObserver.observe(container);
        }

        this.activeMap = mapObj;
        const provider = this;

        return {
            panTo(lat, lng) {
                mapObj.panTo([lat, lng]);
            },
            setZoom(zoom) {
                mapObj.setZoom(zoom);
            },
            getZoom() {
                return mapObj.getZoom();
            },
            getBounds() {
                const bounds = mapObj.getBounds();
                return {
                    contains(latLng) {
                        return bounds.contains([latLng.lat, latLng.lng]);
                    }
                };
            },
            fitBounds(latLngs, padding) {
                if (latLngs.length === 0) return;
                const bounds = L.latLngBounds(latLngs.map(p => [p.lat, p.lng]));
                const padTopLeft: [number, number] = padding
                    ? [padding.left ?? 20, padding.top ?? 40]
                    : [40, 40];
                const padBottomRight: [number, number] = padding
                    ? [padding.right ?? 20, padding.bottom ?? 40]
                    : [40, 40];
                mapObj.fitBounds(bounds, {
                    paddingTopLeft: padTopLeft,
                    paddingBottomRight: padBottomRight,
                });
            },
            clearOverlays() {
                provider.overlays.forEach(o => o.remove());
                provider.overlays = [];
            },
            addMarker(markerOptions) {
                let m;
                if (markerOptions.html) {
                    const [width, height] = provider.parseHtmlDimensions(markerOptions.html);
                    const htmlContent = typeof markerOptions.html === "string"
                        ? markerOptions.html
                        : markerOptions.html.outerHTML;
                    const icon = L.divIcon({
                        html: htmlContent,
                        className: "custom-leaflet-marker",
                        iconSize: [width, height],
                        iconAnchor: [width / 2, height / 2]
                    });
                    m = L.marker([markerOptions.position.lat, markerOptions.position.lng], {
                        icon,
                        title: markerOptions.title,
                        zIndexOffset: markerOptions.zIndex || 0
                    });
                } else {
                    m = L.marker([markerOptions.position.lat, markerOptions.position.lng], {
                        title: markerOptions.title,
                        zIndexOffset: markerOptions.zIndex || 0
                    });
                }

                m.addTo(mapObj);

                if (markerOptions.onClick) {
                    m.on("click", markerOptions.onClick);
                }

                provider.overlays.push(m);
                return m;
            },
            addPolyline(polylineOptions) {
                const pathCoords = polylineOptions.path.map(p => [p.lat, p.lng]);
                const lineOptions: any = {
                    color: polylineOptions.strokeColor,
                    weight: polylineOptions.strokeWeight,
                    opacity: polylineOptions.strokeOpacity,
                    lineCap: "round",
                    lineJoin: "round",
                    interactive: false,
                };
                if (polylineOptions.dashed) {
                    lineOptions.dashArray = "6, 10";
                }
                const p = L.polyline(pathCoords, lineOptions).addTo(mapObj);
                if (polylineOptions.zIndex && polylineOptions.zIndex >= 150 && typeof p.bringToFront === "function") {
                    p.bringToFront();
                }
                provider.overlays.push(p);
                return p;
            },
            addListener(event, callback) {
                const mappedEvent = event === "zoom_changed" ? "zoomend" :
                                    event === "idle" ? "moveend" :
                                    event === "click" ? "click" : "dragstart";

                mapObj.on(mappedEvent, callback);
                return () => {
                    mapObj.off(mappedEvent, callback);
                };
            }
        };
    }

    destroyMap(): void {
        if (this.wheelCleanup) {
            this.wheelCleanup();
            this.wheelCleanup = null;
        }
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        this.overlays.forEach(o => o.remove());
        this.overlays = [];
        if (this.activeMap && this.activeMap.remove) {
            try {
                this.activeMap.remove();
            } catch (e) {}
        }
        this.activeMap = null;
        if (this.container) {
            this.container.innerHTML = "";
            this.container = null;
        }
    }

    async autosuggest(query: string): Promise<AutosuggestSuggestion[]> {
        await this.throttleNominatim();
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=8&countrycodes=in&viewbox=77.3,13.3,77.9,12.7&bounded=1`;
        const res = await fetch(url, {
            headers: {
                "Accept": "application/json"
            }
        });
        if (!res.ok) {
            throw new Error(`Nominatim autosuggest failed with HTTP ${res.status}`);
        }
        const data = await res.json();
        return data.map((item: any) => {
            const placeId = item.place_id.toString();
            const lat = parseFloat(item.lat);
            const lng = parseFloat(item.lon);

            this.cachedSuggestions[placeId] = { lat, lng };

            return {
                placeId,
                description: item.display_name,
                mainText: item.name || item.display_name.split(",")[0],
                secondaryText: item.display_name.split(",").slice(1).join(",").trim()
            };
        });
    }

    async geocode(placeId: string, address?: string): Promise<{ lat: number; lng: number } | null> {
        if (placeId && this.cachedSuggestions[placeId]) {
            return this.cachedSuggestions[placeId];
        }

        if (address) {
            const cacheKey = address.trim().toLowerCase();
            if (this.geocodeCache[cacheKey]) {
                return this.geocodeCache[cacheKey];
            }
            await this.throttleNominatim();
            const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
            const res = await fetch(url, {
                headers: {
                    "Accept": "application/json"
                }
            });
            if (!res.ok) {
                throw new Error(`Nominatim geocoding failed with HTTP ${res.status}`);
            }
            const data = await res.json();
            if (data && data[0]) {
                const coords = {
                    lat: parseFloat(data[0].lat),
                    lng: parseFloat(data[0].lon)
                };
                this.geocodeCache[cacheKey] = coords;
                return coords;
            }
        }
        return null;
    }

    async reverseGeocode(lat: number, lng: number): Promise<string | null> {
        const cacheKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;
        if (this.reverseGeocodeCache[cacheKey]) {
            return this.reverseGeocodeCache[cacheKey];
        }
        await this.throttleNominatim();
        const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
        const res = await fetch(url, {
            headers: {
                "Accept": "application/json"
            }
        });
        if (!res.ok) {
            throw new Error(`Nominatim reverse geocode failed with HTTP ${res.status}`);
        }
        const data = await res.json();
        if (data && data.display_name) {
            this.reverseGeocodeCache[cacheKey] = data.display_name;
            return data.display_name;
        }
        return null;
    }

    async getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
        const coords = await this.geocode(placeId);
        if (!coords) return null;
        const address = await this.reverseGeocode(coords.lat, coords.lng);
        return {
            placeId,
            name: address ? address.split(",")[0] : "Selected Location",
            address: address || "",
            lat: coords.lat,
            lng: coords.lng
        };
    }

    async calculateRoute(origin: any, destination: any): Promise<any> {
        const url = `https://router.project-osrm.org/route/v1/foot/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
        try {
            const res = await fetch(url);
            return await res.json();
        } catch (e) {
            console.error("OSRM Route failed:", e);
            return null;
        }
    }
}

// ----------------------------------------------------
// 4. MAP SERVICE MANAGER (ORCHESTRATOR SINGLETON)
// ----------------------------------------------------
class MapServiceOrchestrator {
    private providerInstance: IFullMapProvider | null = null;
    private initializedProviderType: MapProviderType | null = null;

    private async ensureProvider(): Promise<IFullMapProvider> {
        const active = getActiveProvider();
        if (this.providerInstance && this.initializedProviderType === active && active !== null) {
            return this.providerInstance;
        }

        if (!active) {
            const preferred = getPreferredProvider();
            const loaded = await loadMapProvider(preferred);
            return this.instantiateProvider(loaded);
        }

        return this.instantiateProvider(active);
    }

    private instantiateProvider(providerType: MapProviderType): IFullMapProvider {
        console.log(`[MapService] Instantiating provider wrapper for: "${providerType}"`);
        if (providerType === "google") {
            this.providerInstance = new GoogleMapProvider();
        } else if (providerType === "mapmyindia") {
            this.providerInstance = new MapplsMapProvider();
        } else {
            this.providerInstance = new LeafletMapProvider();
        }
        this.initializedProviderType = providerType;
        return this.providerInstance;
    }

    async initializeMap(container: HTMLDivElement, options: any): Promise<IMapInstance> {
        const provider = await this.ensureProvider();
        return provider.initializeMap(container, options);
    }

    async fallbackFromProvider(failed: MapProviderType): Promise<MapProviderType> {
        await this.destroyMap();
        markProviderFailed(failed);
        const nextProvider = await loadMapProvider(getPreferredProvider());
        this.instantiateProvider(nextProvider);
        return nextProvider;
    }

    async destroyMap(): Promise<void> {
        if (this.providerInstance) {
            this.providerInstance.destroyMap();
            this.providerInstance = null;
            this.initializedProviderType = null;
        }
    }

    getLocalStopSuggestions(query: string, localStops: Stop[] = []): AutosuggestSuggestion[] {
        const normalizedQuery = query.toLowerCase().trim();
        if (!normalizedQuery) return [];
        return localStops
            .filter(stop => stop.stop_name.toLowerCase().includes(normalizedQuery))
            .slice(0, 5)
            .map(stop => ({
                placeId: stop.stop_id,
                description: stop.stop_name,
                mainText: stop.stop_name,
                secondaryText: stop.busNumbers && stop.busNumbers.length > 0
                    ? `Buses: ${stop.busNumbers.slice(0, 3).join(", ")}`
                    : (stop.line_code ? `${stop.line_code} Line Metro` : "Bus Stop"),
                isLocalStop: true,
                stop
            }));
    }

    async autosuggestWithStatus(
        query: string,
        localStops: Stop[] = []
    ): Promise<{ suggestions: AutosuggestSuggestion[]; remoteError: string | null }> {
        const localMatches = this.getLocalStopSuggestions(query, localStops);

        if (query.trim().length < 2) {
            return { suggestions: localMatches, remoteError: null };
        }

        let remoteMatches: AutosuggestSuggestion[] = [];
        let remoteError: string | null = null;
        try {
            const provider = await this.ensureProvider();
            remoteMatches = await provider.autosuggest(query);
        } catch (e: any) {
            remoteError = e?.message || "Location search temporarily unavailable";
            console.warn("[MapService] Active provider autosuggest failed. Returning local stop matches:", e);
        }

        const combined = [...localMatches];
        remoteMatches.forEach(rm => {
            const exists = combined.some(c =>
                c.description.toLowerCase().trim() === rm.description.toLowerCase().trim() ||
                c.mainText.toLowerCase().trim() === rm.mainText.toLowerCase().trim()
            );
            if (!exists) {
                combined.push(rm);
            }
        });

        return { suggestions: combined.slice(0, 10), remoteError };
    }

    async autosuggest(query: string, localStops: Stop[] = []): Promise<AutosuggestSuggestion[]> {
        const { suggestions } = await this.autosuggestWithStatus(query, localStops);
        return suggestions;
    }

    async geocode(placeId: string, address?: string): Promise<{ lat: number; lng: number } | null> {
        try {
            const provider = await this.ensureProvider();
            return await provider.geocode(placeId, address);
        } catch (e) {
            console.error("[MapService] Geocoding failed:", e);
            return null;
        }
    }

    async reverseGeocode(lat: number, lng: number): Promise<string | null> {
        try {
            const provider = await this.ensureProvider();
            return await provider.reverseGeocode(lat, lng);
        } catch (e) {
            console.error("[MapService] Reverse geocoding failed:", e);
            return null;
        }
    }

    async getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
        try {
            const provider = await this.ensureProvider();
            return await provider.getPlaceDetails(placeId);
        } catch (e) {
            console.error("[MapService] Fetching place details failed:", e);
            return null;
        }
    }
}

export const MapService = new MapServiceOrchestrator();
