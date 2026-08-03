/// <reference types="@types/google.maps" />
import { getActiveProvider, loadMapProvider } from "./mapLoader";
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

    async initializeMap(container: HTMLDivElement, options: any): Promise<IMapInstance> {
        this.destroyMap();

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
// 3. LEAFLET + OPENSTREETMAP PROVIDER IMPLEMENTATION
// ----------------------------------------------------
class LeafletMapProvider implements IFullMapProvider {
    private activeMap: any = null;
    private overlays: any[] = [];
    private cachedSuggestions: Record<string, { lat: number; lng: number }> = {};

    async initializeMap(container: HTMLDivElement, options: any): Promise<IMapInstance> {
        this.destroyMap();

        const L = (window as any).L;
        const mapObj = L.map(container, {
            zoomControl: false,
            minZoom: options.minZoom || 10,
            maxZoom: options.maxZoom || 18,
        }).setView([options.center.lat, options.center.lng], options.zoom);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20
        }).addTo(mapObj);

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
                const pad = padding ? [padding.top || 40, padding.left || 40] : [40, 40];
                mapObj.fitBounds(bounds, { padding: pad });
            },
            clearOverlays() {
                provider.overlays.forEach(o => o.remove());
                provider.overlays = [];
            },
            addMarker(markerOptions) {
                let m;
                if (markerOptions.html) {
                    let htmlContent = "";
                    if (typeof markerOptions.html === "string") {
                        htmlContent = markerOptions.html;
                    } else {
                        htmlContent = markerOptions.html.outerHTML;
                    }
                    const icon = L.divIcon({
                        html: htmlContent,
                        className: "custom-leaflet-marker",
                        iconSize: [20, 20],
                        iconAnchor: [10, 10]
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
                };
                if (polylineOptions.dashed) {
                    lineOptions.dashArray = "6, 12";
                }
                const p = L.polyline(pathCoords, lineOptions).addTo(mapObj);
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
        this.overlays.forEach(o => o.remove());
        this.overlays = [];
        if (this.activeMap && this.activeMap.remove) {
            try {
                this.activeMap.remove();
            } catch (e) {}
        }
        this.activeMap = null;
    }

    async autosuggest(query: string): Promise<AutosuggestSuggestion[]> {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=8&countrycodes=in&viewbox=77.3,13.3,77.9,12.7&bounded=1`;
        try {
            const res = await fetch(url, {
                headers: {
                    "User-Agent": "NammaRouteBengaluru/1.0"
                }
            });
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
        } catch (e) {
            console.error("Nominatim Autosuggest failed:", e);
            return [];
        }
    }

    async geocode(placeId: string, address?: string): Promise<{ lat: number; lng: number } | null> {
        if (placeId && this.cachedSuggestions[placeId]) {
            return this.cachedSuggestions[placeId];
        }

        if (address) {
            const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
            try {
                const res = await fetch(url, {
                    headers: {
                        "User-Agent": "NammaRouteBengaluru/1.0"
                    }
                });
                const data = await res.json();
                if (data && data[0]) {
                    return {
                        lat: parseFloat(data[0].lat),
                        lng: parseFloat(data[0].lon)
                    };
                }
            } catch (e) {
                console.error("Nominatim geocoding failed:", e);
            }
        }
        return null;
    }

    async reverseGeocode(lat: number, lng: number): Promise<string | null> {
        const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
        try {
            const res = await fetch(url, {
                headers: {
                    "User-Agent": "NammaRouteBengaluru/1.0"
                }
            });
            const data = await res.json();
            if (data && data.display_name) {
                return data.display_name;
            }
        } catch (e) {
            console.error("Nominatim reverse geocode failed:", e);
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
        if (this.providerInstance && this.initializedProviderType === active) {
            return this.providerInstance;
        }

        if (!active) {
            const preferred = (import.meta.env.VITE_MAP_PROVIDER || "google") as MapProviderType;
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

    async destroyMap(): Promise<void> {
        if (this.providerInstance) {
            this.providerInstance.destroyMap();
        }
    }

    async autosuggest(query: string, localStops: Stop[] = []): Promise<AutosuggestSuggestion[]> {
        const normalizedQuery = query.toLowerCase().trim();
        
        const localMatches: AutosuggestSuggestion[] = localStops
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

        if (!query.trim()) {
            return localMatches;
        }

        let remoteMatches: AutosuggestSuggestion[] = [];
        try {
            const provider = await this.ensureProvider();
            remoteMatches = await provider.autosuggest(query);
        } catch (e) {
            console.warn("[MapService] Active provider autosuggest failed. Falling back strictly to local stops:", e);
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

        return combined.slice(0, 10);
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
