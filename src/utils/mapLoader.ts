export type MapProviderType = "google" | "mapmyindia" | "leaflet";

let loadedProvider: MapProviderType | null = null;
let loadPromise: Promise<MapProviderType> | null = null;

// Global flag to track Google Maps authentication state
let googleAuthFailed = false;
let googleAuthResolver: ((val: boolean) => void) | null = null;

// Attach global gm_authFailure handler early
if (typeof window !== "undefined") {
    const prevAuthFailure = (window as any).gm_authFailure;
    (window as any).gm_authFailure = function() {
        console.error("[MapLoader] Google Maps authentication failure detected (e.g. billing not enabled).");
        googleAuthFailed = true;
        if (googleAuthResolver) {
            googleAuthResolver(false);
        }
        if (prevAuthFailure) prevAuthFailure();
    };
}

/**
 * Returns the currently active/loaded map provider type.
 */
export function getActiveProvider(): MapProviderType | null {
    return loadedProvider;
}

/**
 * Attempts to load the preferred map provider, falling back down the chain on failure.
 */
export function loadMapProvider(preferred: MapProviderType): Promise<MapProviderType> {
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
        const order: MapProviderType[] = [];
        if (preferred === "google") {
            order.push("google", "mapmyindia", "leaflet");
        } else if (preferred === "mapmyindia") {
            order.push("mapmyindia", "google", "leaflet");
        } else {
            order.push("leaflet", "google", "mapmyindia");
        }

        console.log(`[MapLoader] Loading map provider. Preference: "${preferred}". Order:`, order);

        for (const provider of order) {
            try {
                console.log(`[MapLoader] Attempting to load: "${provider}"`);
                const success = await tryLoadProvider(provider);
                if (success) {
                    loadedProvider = provider;
                    console.log(`[MapLoader] Active map provider is now: "${provider}"`);
                    return provider;
                }
                console.warn(`[MapLoader] Provider "${provider}" failed to initialize or authenticate.`);
            } catch (err) {
                console.error(`[MapLoader] Error loading provider "${provider}":`, err);
            }
        }

        // Hard fallback to leaflet which requires no authentication/network keys
        console.warn("[MapLoader] All providers failed. Forcing Leaflet fallback.");
        const leafletLoaded = await tryLoadProvider("leaflet");
        if (leafletLoaded) {
            loadedProvider = "leaflet";
            return "leaflet";
        }

        throw new Error("[MapLoader] All map providers failed to load.");
    })();

    return loadPromise;
}

function tryLoadProvider(provider: MapProviderType): Promise<boolean> {
    return new Promise((resolve) => {
        if (typeof window === "undefined") {
            resolve(false);
            return;
        }

        if (provider === "google") {
            // If we already know Google auth failed in a previous attempt
            if (googleAuthFailed) {
                resolve(false);
                return;
            }

            // Check if already loaded
            if ((window as any).google && (window as any).google.maps) {
                resolve(true);
                return;
            }

            const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
            if (!apiKey || apiKey.startsWith("%VITE_")) {
                console.warn("[MapLoader] Google Maps API key is missing or is placeholder.");
                resolve(false);
                return;
            }

            googleAuthResolver = resolve;

            // Set up script tag
            const script = document.createElement("script");
            script.id = "google-maps-sdk";
            script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=weekly&libraries=places,geocoding`;
            script.async = true;
            script.defer = true;

            script.onload = () => {
                // Wait slightly (500ms) to ensure gm_authFailure didn't fire
                setTimeout(() => {
                    if (googleAuthFailed) {
                        resolve(false);
                    } else if ((window as any).google && (window as any).google.maps) {
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                }, 500);
            };

            script.onerror = () => {
                console.error("[MapLoader] Google Maps script failed to load (network error).");
                resolve(false);
            };

            document.head.appendChild(script);

        } else if (provider === "mapmyindia") {
            if ((window as any).mappls) {
                resolve(true);
                return;
            }

            const apiKey = import.meta.env.VITE_MAPMYINDIA_API_KEY;
            if (!apiKey || apiKey === "dummy_mapmyindia_key" || apiKey.startsWith("%VITE_")) {
                console.warn("[MapLoader] MapmyIndia (Mappls) API key is missing or is dummy.");
                resolve(false);
                return;
            }

            const script = document.createElement("script");
            script.id = "mappls-maps-sdk";
            // Uses the official Mappls SDK loader endpoint
            script.src = `https://apis.mappls.com/advancedmaps/api/${apiKey}/map_sdk?v=3.0&layer=vector`;
            script.async = true;
            script.defer = true;

            script.onload = () => {
                if ((window as any).mappls) {
                    resolve(true);
                } else {
                    // Try old fallback namespace
                    if ((window as any).MapmyIndia) {
                        (window as any).mappls = (window as any).MapmyIndia;
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                }
            };

            script.onerror = () => {
                console.error("[MapLoader] MapmyIndia script failed to load (network error).");
                resolve(false);
            };

            document.head.appendChild(script);

        } else if (provider === "leaflet") {
            if ((window as any).L) {
                resolve(true);
                return;
            }

            // Inject Leaflet CSS
            if (!document.getElementById("leaflet-css")) {
                const link = document.createElement("link");
                link.id = "leaflet-css";
                link.rel = "stylesheet";
                link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
                document.head.appendChild(link);
            }

            // Inject Leaflet JS
            const script = document.createElement("script");
            script.id = "leaflet-js";
            script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
            script.async = true;

            script.onload = () => {
                if ((window as any).L) {
                    resolve(true);
                } else {
                    resolve(false);
                }
            };

            script.onerror = () => {
                console.error("[MapLoader] Leaflet script failed to load (network error).");
                resolve(false);
            };

            document.head.appendChild(script);
        } else {
            resolve(false);
        }
    });
}
