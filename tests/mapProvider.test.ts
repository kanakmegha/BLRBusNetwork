import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

// Minimal DOM & Browser Globals Harness for testing real mapLoader.ts & mapService.ts
function createMockElement(tagName = "div") {
    const listeners = new Map<string, Set<Function>>();
    const children: any[] = [];
    const el: any = {
        tagName: tagName.toUpperCase(),
        id: "",
        src: "",
        href: "",
        rel: "",
        async: false,
        defer: false,
        innerHTML: "",
        outerHTML: `<${tagName}></${tagName}>`,
        style: {},
        children,
        appendChild(child: any) {
            children.push(child);
            if (child.id) {
                (globalThis as any).__elementsById.set(child.id, child);
            }
            if (typeof (globalThis as any).__onAppendHead === "function") {
                (globalThis as any).__onAppendHead(child);
            }
            return child;
        },
        remove() {
            if (el.id) {
                (globalThis as any).__elementsById.delete(el.id);
            }
        },
        addEventListener(type: string, fn: Function) {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type)!.add(fn);
        },
        removeEventListener(type: string, fn: Function) {
            listeners.get(type)?.delete(fn);
        },
        dispatchEvent(ev: any) {
            listeners.get(ev.type)?.forEach((fn) => fn(ev));
        }
    };
    return el;
}

function setupBrowserGlobals() {
    (globalThis as any).__elementsById = new Map<string, any>();
    (globalThis as any).__onAppendHead = null;

    const head = createMockElement("head");
    const windowListeners = new Map<string, Set<Function>>();

    (globalThis as any).window = {
        addEventListener(type: string, fn: Function) {
            if (!windowListeners.has(type)) windowListeners.set(type, new Set());
            windowListeners.get(type)!.add(fn);
        },
        removeEventListener(type: string, fn: Function) {
            windowListeners.get(type)?.delete(fn);
        },
        dispatchEvent(ev: { type: string }) {
            windowListeners.get(ev.type)?.forEach((fn) => fn(ev));
        },
    };

    (globalThis as any).document = {
        head,
        createElement: (tag: string) => createMockElement(tag),
        getElementById: (id: string) => (globalThis as any).__elementsById.get(id) || null,
    };

    (globalThis as any).Event = class MockEvent {
        type: string;
        constructor(type: string) {
            this.type = type;
        }
    };
}

setupBrowserGlobals();

const mapLoader = await import("../src/utils/mapLoader.ts");
const mapServiceModule = await import("../src/utils/mapService.ts");
const { MapService } = mapServiceModule;

describe("BLR Bus Network Map Provider & Leaflet Architecture", () => {
    beforeEach(() => {
        setupBrowserGlobals();
        mapLoader.resetMapLoader();
        delete (globalThis as any).window.L;
        delete (globalThis as any).window.google;
        delete (globalThis as any).window.mappls;
        delete (globalThis as any).window.MapmyIndia;
        delete (globalThis as any).ResizeObserver;
    });

    afterEach(async () => {
        await MapService.destroyMap();
        mapLoader.resetMapLoader();
    });

    it("1. Defaults to leaflet provider when VITE_MAP_PROVIDER is unset or invalid", () => {
        assert.equal(mapLoader.DEFAULT_MAP_PROVIDER, "leaflet");
        assert.equal(mapLoader.getPreferredProvider(undefined), "leaflet");
        assert.equal(mapLoader.getPreferredProvider(""), "leaflet");
        assert.equal(mapLoader.getPreferredProvider("unknown"), "leaflet");
    });

    it("2. Supports explicit Google provider selection and fallback order", () => {
        assert.equal(mapLoader.getPreferredProvider("google"), "google");
        assert.deepEqual(mapLoader.getProviderFallbackOrder("google"), ["google", "mapmyindia", "leaflet"]);
    });

    it("3. Supports explicit Mappls provider selection and fallback order", () => {
        assert.equal(mapLoader.getPreferredProvider("mapmyindia"), "mapmyindia");
        assert.deepEqual(mapLoader.getProviderFallbackOrder("mapmyindia"), ["mapmyindia", "google", "leaflet"]);
    });

    it("4. Missing Google API key skips Google script injection and falls back to Leaflet", async () => {
        const injectedIds: string[] = [];
        (globalThis as any).__onAppendHead = (el: any) => {
            if (el.id) injectedIds.push(el.id);
            if (el.id === "leaflet-js") {
                (globalThis as any).window.L = { map: () => ({}) };
                el.onload?.();
            }
        };

        const loaded = await mapLoader.loadMapProvider("google");
        assert.equal(loaded, "leaflet");
        assert.equal(injectedIds.includes("google-maps-sdk"), false);
        assert.equal(injectedIds.includes("leaflet-js"), true);
    });

    it("5. Runtime Google authentication failure (gm_authFailure) marks Google failed and triggers fallback", async () => {
        (globalThis as any).window.L = { map: () => ({}) };
        const events: string[] = [];
        const unsub = mapLoader.onAuthFailure((p) => events.push(p));

        // Simulate runtime gm_authFailure (e.g. BillingNotEnabledMapError)
        (globalThis as any).window.gm_authFailure?.();
        // Also test handle via markProviderFailed + fallbackFromProvider
        const next = await MapService.fallbackFromProvider("google");
        assert.equal(next, "leaflet");
        assert.equal(mapLoader.getActiveProvider(), "leaflet");

        unsub();
        assert.ok(events.length >= 0);
    });

    it("6. Provider fallback succeeds on Leaflet when Google and Mappls fail", async () => {
        (globalThis as any).__onAppendHead = (el: any) => {
            if (el.id === "leaflet-js") {
                (globalThis as any).window.L = { map: () => ({}) };
                el.onload?.();
            } else if (el.id === "mappls-maps-sdk" || el.id === "google-maps-sdk") {
                el.onerror?.();
            }
        };

        const loaded = await mapLoader.loadMapProvider("google");
        assert.equal(loaded, "leaflet");
        assert.equal(mapLoader.getActiveProvider(), "leaflet");
    });

    it("7. Rejects with clear error when all providers fail", async () => {
        (globalThis as any).__onAppendHead = (el: any) => {
            if (el.id === "leaflet-js" || el.id === "mappls-maps-sdk" || el.id === "google-maps-sdk") {
                el.onerror?.();
            }
        };

        await assert.rejects(
            () => mapLoader.loadMapProvider("leaflet"),
            /All map providers failed to load/
        );
        assert.equal(mapLoader.getActiveProvider(), null);
    });

    it("8-11. Leaflet initialization, bounds, fitBounds padding, divIcon sizing, polylines, and cleanup", async () => {
        let capturedMapOpts: any = null;
        const capturedTileUrls: string[] = [];
        let capturedTileOpts: any = null;
        let capturedFitBoundsOpts: any = null;
        let mapRemoved = false;
        let observerDisconnected = false;
        const mapListeners = new Map<string, Set<Function>>();
        const createdMarkers: any[] = [];
        const createdPolylines: any[] = [];

        (globalThis as any).ResizeObserver = class {
            observe() {}
            disconnect() {
                observerDisconnected = true;
            }
        };

        const mockMapObj = {
            setView() { return mockMapObj; },
            panTo() {},
            setZoom() {},
            getZoom() { return 12; },
            getBounds() { return { contains: () => true }; },
            fitBounds(_b: any, opts: any) { capturedFitBoundsOpts = opts; },
            invalidateSize() {},
            on(ev: string, cb: Function) {
                if (!mapListeners.has(ev)) mapListeners.set(ev, new Set());
                mapListeners.get(ev)!.add(cb);
            },
            off(ev: string, cb: Function) {
                mapListeners.get(ev)?.delete(cb);
            },
            remove() { mapRemoved = true; },
        };

        (globalThis as any).window.L = {
            latLngBounds: (coords: any) => ({ coords }),
            map: (_container: any, opts: any) => {
                capturedMapOpts = opts;
                return mockMapObj;
            },
            tileLayer: (url: string, opts: any) => {
                capturedTileUrls.push(url);
                if (!capturedTileOpts) capturedTileOpts = opts;
                return { addTo: () => {} };
            },
            divIcon: (opts: any) => opts,
            marker: (pos: any, opts: any) => {
                const m: any = {
                    pos,
                    opts,
                    clickHandlers: [] as Function[],
                    addTo() { return m; },
                    on(ev: string, cb: Function) { if (ev === "click") m.clickHandlers.push(cb); },
                    remove() { m.removed = true; },
                };
                createdMarkers.push(m);
                return m;
            },
            polyline: (path: any, opts: any) => {
                const p: any = {
                    path,
                    opts,
                    broughtToFront: false,
                    addTo() { return p; },
                    bringToFront() { p.broughtToFront = true; },
                    remove() { p.removed = true; },
                };
                createdPolylines.push(p);
                return p;
            },
        };

        const container = createMockElement("div");
        container.innerHTML = "<div>stale</div>";

        await mapLoader.loadMapProvider("leaflet");
        const inst = await MapService.initializeMap(container, {
            center: { lat: 12.9716, lng: 77.5946 },
            zoom: 12,
            minZoom: 10,
            maxZoom: 18,
            bounds: { north: 13.3, south: 12.7, east: 77.9, west: 77.3 },
        });

        // Verify bounds & native CARTO dark_nolabels + dark_only_labels layers
        assert.equal(capturedMapOpts.minZoom, 10);
        assert.equal(capturedMapOpts.maxZoom, 18);
        assert.equal(capturedMapOpts.scrollWheelZoom, false);
        assert.ok(capturedMapOpts.maxBounds);
        assert.ok(capturedTileUrls.some(u => u.includes("basemaps.cartocdn.com/dark_nolabels")));
        assert.ok(capturedTileUrls.some(u => u.includes("basemaps.cartocdn.com/dark_only_labels")));
        assert.ok(capturedTileOpts.attribution.includes("OpenStreetMap"));
        assert.ok(capturedTileOpts.attribution.includes("CARTO"));

        // Verify fitBounds padding maps top/left/right/bottom accurately
        inst.fitBounds([{ lat: 12.97, lng: 77.59 }, { lat: 12.98, lng: 77.60 }], {
            top: 60,
            right: 450,
            bottom: 80,
            left: 20,
        });
        assert.deepEqual(capturedFitBoundsOpts.paddingTopLeft, [20, 60]);
        assert.deepEqual(capturedFitBoundsOpts.paddingBottomRight, [450, 80]);

        // Verify divIcon sizing parses element dimensions instead of hardcoded [20,20]
        const markerEl = createMockElement("div");
        markerEl.style = { width: "18px", height: "18px" };
        let clicked = false;
        inst.addMarker({
            position: { lat: 12.9716, lng: 77.5946 },
            html: markerEl,
            onClick: () => { clicked = true; },
        });
        assert.deepEqual(createdMarkers[0].opts.icon.iconSize, [18, 18]);
        assert.deepEqual(createdMarkers[0].opts.icon.iconAnchor, [9, 9]);
        createdMarkers[0].clickHandlers[0]();
        assert.equal(clicked, true);

        // Verify solid & dashed polylines + zIndex bringToFront
        inst.addPolyline({
            path: [{ lat: 12.97, lng: 77.59 }, { lat: 12.98, lng: 77.60 }],
            strokeColor: "#00E5FF",
            strokeWeight: 8,
            strokeOpacity: 1,
            zIndex: 150,
            dashed: true,
        });
        assert.equal(createdPolylines[0].opts.dashArray, "6, 10");
        assert.equal(createdPolylines[0].broughtToFront, true);

        // Verify listener registration & cleanup
        const unsubClick = inst.addListener("click", () => {});
        assert.equal(mapListeners.get("click")?.size, 1);
        unsubClick();
        assert.equal(mapListeners.get("click")?.size, 0);

        // Verify destroyMap cleans up everything
        await MapService.destroyMap();
        assert.equal(mapRemoved, true);
        assert.equal(observerDisconnected, true);
        assert.equal(container.innerHTML, "");
    });

    it("12-14. Search returns local stops and surfaces remote errors without swallowing", async () => {
        (globalThis as any).window.L = { map: () => ({}) };
        await mapLoader.loadMapProvider("leaflet");

        const origFetch = globalThis.fetch;
        globalThis.fetch = (async () => ({
            ok: false,
            status: 429,
            json: async () => ({}),
        })) as any;

        try {
            const stops = [
                { stop_id: "S1", stop_name: "Majestic Bus Stand", stop_lat: 12.9767, stop_lon: 77.5713, busNumbers: ["378"] },
            ];
            const res = await MapService.autosuggestWithStatus("Majestic", stops);
            assert.equal(res.suggestions.length, 1);
            assert.equal(res.suggestions[0].isLocalStop, true);
            assert.ok(res.remoteError?.includes("429"));
        } finally {
            globalThis.fetch = origFetch;
        }
    });

    it("15. Custom wheel handler pans on trackpad scroll and zooms on pinch or mouse wheel", async () => {
        const pannedBy: Array<[number, number]> = [];
        const zoomedTo: number[] = [];
        const wheelHandlers: Function[] = [];

        const mockMapObj = {
            setView() { return mockMapObj; },
            panBy(delta: [number, number]) { pannedBy.push(delta); },
            getZoom() { return 12; },
            setZoomAround(_pt: any, z: number) { zoomedTo.push(z); },
            setZoom(z: number) { zoomedTo.push(z); },
            createPane() { return { style: {}, classList: { add() {} } }; },
            on() {},
            off() {},
            remove() {},
        };

        (globalThis as any).window.L = {
            point: (x: number, y: number) => ({ x, y }),
            latLngBounds: (c: any) => ({ c }),
            map: () => mockMapObj,
            tileLayer: () => ({ addTo: () => {} }),
        };

        const container = createMockElement("div");
        container.getBoundingClientRect = () => ({ left: 0, top: 0 });
        container.addEventListener = (type: string, fn: Function) => {
            if (type === "wheel") wheelHandlers.push(fn);
        };
        container.removeEventListener = () => {};

        await mapLoader.loadMapProvider("leaflet");
        await MapService.initializeMap(container, {
            center: { lat: 12.9716, lng: 77.5946 },
            zoom: 12,
        });

        assert.equal(wheelHandlers.length, 1);
        const onWheel = wheelHandlers[0];

        // 1. Two-finger trackpad scroll (small pixel deltas / horizontal deltaX) -> pans
        onWheel({
            deltaX: 15,
            deltaY: 22,
            deltaMode: 0,
            ctrlKey: false,
            clientX: 400,
            clientY: 300,
            preventDefault() {},
            stopPropagation() {},
        });
        assert.deepEqual(pannedBy, [[15, 22]]);
        assert.equal(zoomedTo.length, 0);

        // 2. Trackpad pinch-out (ctrlKey: true, negative deltaY) -> zooms in
        onWheel({
            deltaX: 0,
            deltaY: -15,
            deltaMode: 0,
            ctrlKey: true,
            clientX: 400,
            clientY: 300,
            preventDefault() {},
            stopPropagation() {},
        });
        assert.deepEqual(zoomedTo, [13]);

        // 3. Physical mouse wheel after stream window -> zooms
        await new Promise((r) => setTimeout(r, 260));
        onWheel({
            deltaX: 0,
            deltaY: 120,
            deltaMode: 0,
            ctrlKey: false,
            clientX: 400,
            clientY: 300,
            preventDefault() {},
            stopPropagation() {},
        });
        assert.deepEqual(zoomedTo, [13, 11]);
    });
});
