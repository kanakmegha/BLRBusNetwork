export type MapProviderType = "google" | "mapmyindia" | "leaflet";

export const DEFAULT_MAP_PROVIDER: MapProviderType = "leaflet";

let loadedProvider: MapProviderType | null = null;
let loadPromise: Promise<MapProviderType> | null = null;
const failedProviders = new Set<MapProviderType>();
const authFailureListeners = new Set<(provider: MapProviderType) => void>();

// Global flag to track Google Maps authentication state
let googleAuthFailed = false;
let googleAuthResolver: ((val: boolean) => void) | null = null;

function handleGoogleAuthFailure() {
    console.error("[MapLoader] Google Maps authentication failure detected (e.g. billing not enabled or invalid key).");
    googleAuthFailed = true;
    failedProviders.add("google");
    if (loadedProvider === "google") {
        loadedProvider = null;
        loadPromise = null;
    }
    if (googleAuthResolver) {
        const resolver = googleAuthResolver;
        googleAuthResolver = null;
        resolver(false);
    }
    if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("google-maps-auth-failure"));
    }
    authFailureListeners.forEach((cb) => {
        try {
            cb("google");
        } catch (err) {
            console.error("[MapLoader] Auth failure listener error:", err);
        }
    });
}

// Attach global gm_authFailure handler early
if (typeof window !== "undefined") {
    const prevAuthFailure = (window as any).gm_authFailure;
    (window as any).gm_authFailure = function () {
        handleGoogleAuthFailure();
        if (typeof prevAuthFailure === "function") {
            prevAuthFailure();
        }
    };
}

/**
 * Resolves the configured default/preferred map provider.
 */
export function getPreferredProvider(envValue?: string): MapProviderType {
    const raw = (envValue ?? (typeof import.meta !== "undefined" ? (import.meta as any).env?.VITE_MAP_PROVIDER : undefined) ?? DEFAULT_MAP_PROVIDER)
        .toString()
        .trim()
        .toLowerCase();
    if (raw === "google" || raw === "mapmyindia" || raw === "leaflet") {
        return raw;
    }
    return DEFAULT_MAP_PROVIDER;
}

/**
 * Returns the currently active/loaded map provider type.
 */
export function getActiveProvider(): MapProviderType | null {
    return loadedProvider;
}

/**
 * Marks a provider as failed (e.g., post-initialization auth failure) and clears cached state if it was active.
 */
export function markProviderFailed(provider: MapProviderType): void {
    failedProviders.add(provider);
    if (provider === "google") {
        googleAuthFailed = true;
    }
    if (loadedProvider === provider) {
        loadedProvider = null;
        loadPromise = null;
    }
}

/**
 * Subscribes to runtime authentication failures detected after script load.
 */
export function onAuthFailure(listener: (provider: MapProviderType) => void): () => void {
    authFailureListeners.add(listener);
    return () => {
        authFailureListeners.delete(listener);
    };
}

/**
 * Resets loader state (primarily for tests and explicit provider switching).
 */
export function resetMapLoader(): void {
    loadedProvider = null;
    loadPromise = null;
    googleAuthFailed = false;
    googleAuthResolver = null;
    failedProviders.clear();
}

export function getProviderFallbackOrder(preferred: MapProviderType): MapProviderType[] {
    if (preferred === "google") {
        return ["google", "mapmyindia", "leaflet"];
    }
    if (preferred === "mapmyindia") {
        return ["mapmyindia", "google", "leaflet"];
    }
    return ["leaflet", "google", "mapmyindia"];
}

/**
 * Attempts to load the preferred map provider, falling back down the chain on failure.
 */
export function loadMapProvider(preferred: MapProviderType = DEFAULT_MAP_PROVIDER): Promise<MapProviderType> {
    if (loadedProvider && !failedProviders.has(loadedProvider)) {
        return Promise.resolve(loadedProvider);
    }
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
        const order = getProviderFallbackOrder(preferred).filter((p) => !failedProviders.has(p));
        if (!order.includes("leaflet") && !failedProviders.has("leaflet")) {
            order.push("leaflet");
        }

        console.log(`[MapLoader] Loading map provider. Preference: "${preferred}". Order:`, order);

        for (const provider of order) {
            try {
                console.log(`[MapLoader] Attempting to load: "${provider}"`);
                const success = await tryLoadProvider(provider);
                if (success && !failedProviders.has(provider)) {
                    loadedProvider = provider;
                    console.log(`[MapLoader] Active map provider is now: "${provider}"`);
                    return provider;
                }
                failedProviders.add(provider);
                console.warn(`[MapLoader] Provider "${provider}" failed to initialize or authenticate.`);
            } catch (err) {
                failedProviders.add(provider);
                console.error(`[MapLoader] Error loading provider "${provider}":`, err);
            }
        }

        loadPromise = null;
        loadedProvider = null;
        throw new Error("[MapLoader] All map providers failed to load.");
    })();

    return loadPromise;
}

function getEnvVar(key: string): string | undefined {
    if (typeof import.meta !== "undefined" && (import.meta as any).env) {
        return (import.meta as any).env[key];
    }
    return undefined;
}

function tryLoadProvider(provider: MapProviderType): Promise<boolean> {
    return new Promise((resolve) => {
        if (typeof window === "undefined" || typeof document === "undefined") {
            resolve(false);
            return;
        }

        if (provider === "google") {
            if (googleAuthFailed || failedProviders.has("google")) {
                resolve(false);
                return;
            }

            const apiKey = getEnvVar("VITE_GOOGLE_MAPS_API_KEY");
            if (!apiKey || apiKey.startsWith("%VITE_")) {
                console.warn("[MapLoader] Google Maps API key is missing or is placeholder.");
                resolve(false);
                return;
            }

            if ((window as any).google?.maps?.Map && loadedProvider === "google") {
                resolve(true);
                return;
            }

            const existingScript = document.getElementById("google-maps-sdk") as HTMLScriptElement | null;
            if (existingScript) {
                if ((window as any).google?.maps?.importLibrary && !googleAuthFailed) {
                    resolve(true);
                    return;
                }
                existingScript.remove();
            }

            let settled = false;
            const finish = (ok: boolean) => {
                if (settled) return;
                settled = true;
                googleAuthResolver = null;
                resolve(ok);
            };

            googleAuthResolver = finish;

            const callbackName = "__blrGoogleMapsReady";
            (window as any)[callbackName] = () => {
                delete (window as any)[callbackName];
                // Wait briefly for synchronous auth errors, while runtime gm_authFailure
                // also remains armed for post-Map-construction BillingNotEnabledMapError.
                setTimeout(() => {
                    if (googleAuthFailed) {
                        finish(false);
                    } else if ((window as any).google?.maps) {
                        finish(true);
                    } else {
                        finish(false);
                    }
                }, 300);
            };

            const script = document.createElement("script");
            script.id = "google-maps-sdk";
            script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&libraries=places,geocoding,marker&loading=async&callback=${callbackName}`;
            script.async = true;
            script.defer = true;

            const timeoutId = setTimeout(() => {
                console.error("[MapLoader] Google Maps script load timed out.");
                finish(false);
            }, 10000);

            script.onload = () => {
                clearTimeout(timeoutId);
            };

            script.onerror = () => {
                clearTimeout(timeoutId);
                delete (window as any)[callbackName];
                console.error("[MapLoader] Google Maps script failed to load (network error).");
                finish(false);
            };

            document.head.appendChild(script);
        } else if (provider === "mapmyindia") {
            if (failedProviders.has("mapmyindia")) {
                resolve(false);
                return;
            }

            if ((window as any).mappls) {
                resolve(true);
                return;
            }

            const apiKey = getEnvVar("VITE_MAPMYINDIA_API_KEY");
            if (!apiKey || apiKey === "dummy_mapmyindia_key" || apiKey.startsWith("%VITE_")) {
                console.warn("[MapLoader] MapmyIndia (Mappls) API key is missing or is dummy.");
                resolve(false);
                return;
            }

            const existingScript = document.getElementById("mappls-maps-sdk");
            if (existingScript) {
                existingScript.remove();
            }

            const script = document.createElement("script");
            script.id = "mappls-maps-sdk";
            script.src = `https://apis.mappls.com/advancedmaps/api/${encodeURIComponent(apiKey)}/map_sdk?v=3.0&layer=vector`;
            script.async = true;
            script.defer = true;

            const timeoutId = setTimeout(() => {
                console.error("[MapLoader] MapmyIndia script load timed out.");
                resolve(false);
            }, 10000);

            script.onload = () => {
                clearTimeout(timeoutId);
                if ((window as any).mappls) {
                    resolve(true);
                } else if ((window as any).MapmyIndia) {
                    (window as any).mappls = (window as any).MapmyIndia;
                    resolve(true);
                } else {
                    resolve(false);
                }
            };

            script.onerror = () => {
                clearTimeout(timeoutId);
                console.error("[MapLoader] MapmyIndia script failed to load (network error).");
                resolve(false);
            };

            document.head.appendChild(script);
        } else if (provider === "leaflet") {
            if ((window as any).L) {
                resolve(true);
                return;
            }

            if (!document.getElementById("leaflet-css")) {
                const link = document.createElement("link");
                link.id = "leaflet-css";
                link.rel = "stylesheet";
                link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
                document.head.appendChild(link);
            }

            const existingScript = document.getElementById("leaflet-js");
            if (existingScript) {
                existingScript.remove();
            }

            const script = document.createElement("script");
            script.id = "leaflet-js";
            script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
            script.async = true;

            const timeoutId = setTimeout(() => {
                console.error("[MapLoader] Leaflet script load timed out.");
                resolve(false);
            }, 10000);

            script.onload = () => {
                clearTimeout(timeoutId);
                resolve(Boolean((window as any).L));
            };

            script.onerror = () => {
                clearTimeout(timeoutId);
                console.error("[MapLoader] Leaflet script failed to load (network error).");
                resolve(false);
            };

            document.head.appendChild(script);
        } else {
            resolve(false);
        }
    });
}
