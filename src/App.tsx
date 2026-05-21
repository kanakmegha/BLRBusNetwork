import { useEffect, useState } from "react";
import { Map as GoogleMap } from "./components/Map";
import { SearchBox } from "./components/SearchBox";
import { useTransit } from "./hooks/useTransit";
import { Suspense, lazy } from "react";

const LazyRouteResults = lazy(() => import("./components/RouteResults").then(m => ({ default: m.RouteResults })));
const LazyRouteExplorer = lazy(() => import("./components/RouteExplorer").then(m => ({ default: m.RouteExplorer })));
const LazyMetroMap = lazy(() => import("./components/MetroMap").then(m => ({ default: m.MetroMap })));

import type { PathResult, TransitFilter } from "./engine/types";
import "./App.css";

function App() {
  const { isReady, error, isCalculating, stops, findRoute, findNearestStop, getRoutePath } = useTransit();
  const [results, setResults] = useState<PathResult[]>([]);
  const [selectedPath, setSelectedPath] = useState<PathResult | null>(null);
  const [showMetroMap, setShowMetroMap] = useState(false);
  const [fromStopId, setFromStopId] = useState("");
  const [toStopId, setToStopId] = useState("");
  const [originStopName, setOriginStopName] = useState<string | null>(null);
  const [destStopName, setDestStopName] = useState<string | null>(null);
  const [selectedCriteria, setSelectedCriteria] = useState<TransitFilter>("FASTEST");
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({
    lat: 12.9716,
    lng: 77.5946,
  });
  const [recenterCount, setRecenterCount] = useState(0);
  const [explorerRoute, setExplorerRoute] = useState<string | null>(null);
  const [explorerPath, setExplorerPath] = useState<any[]>([]);

  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    if (isReady && stops.length > 0) {
      // Deep Linking: Check for shared route in URL
      const params = new URLSearchParams(window.location.search);
      const sharedRoute = params.get("route");
      if (sharedRoute && !explorerRoute) {
        handleBusClick(sharedRoute);
      }

    }
  }, [isReady, findNearestStop, stops, explorerRoute]);

  const handleSearch = async (fromValue: string, toValue: string) => {
    if (!fromValue || !toValue) return;
    
    // Safety Net: Git LFS pointer check
    try {
      const response = await fetch("/data/metro_stops.json");
      const text = await response.text();
      if (text.trim().startsWith("version https://git-lfs")) {
        alert("Data Sync Error: LFS Pointer detected. Perform a Clean Build.");
        return;
      }
    } catch (e) {
      console.error("LFS check failed", e);
    }

    setIsSearching(true);
    setHasSearched(false);
    setResults([]);
    setSelectedPath(null);

    const pathResults = await findRoute(fromValue, toValue, "08:00:00", selectedCriteria) as PathResult[];
    
    setResults(pathResults);
    setHasSearched(true);
    
    if (pathResults.length > 0) {
      setSelectedPath(pathResults[0]);
    }
    setIsSearching(false);
  };

  const handleCriteriaChange = (criteria: TransitFilter) => {
    setSelectedCriteria(criteria);
  };

  const handlePlaceSelect = (lat: number, lng: number, type: "FROM" | "TO") => {
    const nearest = findNearestStop(lat, lng);
    if (nearest) {
      const R = 6371; // Radius of the earth in km
      const dLat = (nearest.stop_lat - lat) * (Math.PI / 180);
      const dLon = (nearest.stop_lon - lng) * (Math.PI / 180);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat * (Math.PI / 180)) * Math.cos(nearest.stop_lat * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distanceInKm = R * c;
      const walkMeters = Math.round(distanceInKm * 1000);
      const label = `${nearest.stop_name} (${walkMeters}m walk)`;

      if (type === "FROM") {
        setFromStopId(nearest.stop_id);
        setOriginStopName(label);
        setMapCenter({ lat, lng });
      } else {
        setToStopId(nearest.stop_id);
        setDestStopName(label);
      }
    }
  };

  const handleSelectFromMap = (stopId: string, type: "FROM" | "TO") => {
    const stop = stops.find((s) => s.stop_id === stopId);
    if (type === "FROM") {
      setFromStopId(stopId);
      setOriginStopName(stop?.stop_name || null);
    } else {
      setToStopId(stopId);
      setDestStopName(stop?.stop_name || null);
    }
  };

  const handleBusClick = async (busNumber: string) => {
    setExplorerRoute(busNumber);
    if (getRoutePath) {
      const path = await getRoutePath(busNumber);
      setExplorerPath(path);
    }
  };

  return (
    <main className="relative w-full h-screen bg-[#121212] flex flex-col items-center justify-center overflow-hidden">
        {/* SEO Persistence Layer */}
        <h1 className="sr-only">
          Namma Route: Namma BMTC Online & Bangalore Bus Route Navigator | Find BMTC 378 Route Schedule
        </h1>
        <p className="sr-only">
          Ultimate transit app for Bengaluru. Get Namma BMTC online routes, Bangalore bus maps, and official 378 bus schedules for Kengeri to Electronic City.
        </p>

      {error ? (
        <div className="flex flex-col items-center gap-6 p-8 bg-[#1a0a0a] border border-red-500/30 rounded-3xl max-w-sm text-center shadow-2xl animate-in fade-in zoom-in duration-500">
          <div className="text-4xl">🚫</div>
          <div className="space-y-1">
            <h1 className="text-xl font-black text-white uppercase tracking-tighter">System Error</h1>
            <p className="text-[10px] text-red-500/80 font-black uppercase tracking-widest">Data Not Loaded</p>
          </div>
          <p className="text-gray-400 font-medium text-xs leading-relaxed px-4">
            {error}
          </p>
          <button 
            onClick={() => window.location.reload()} 
            className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-all active:scale-95 text-[10px] uppercase tracking-widest shadow-lg shadow-red-900/20"
          >
            Retry Connection
          </button>
        </div>
      ) : (
          <>
            {!isReady && (
              <div className="absolute top-4 right-4 z-[200] bg-[#1e1e1e]/90 backdrop-blur-md px-4 py-2 rounded-full border border-purple-500/30 flex items-center gap-3 animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-[9px] font-black text-white uppercase tracking-widest">Syncing Transit Data...</span>
              </div>
            )}

            {showMetroMap
              ? (
                <Suspense fallback={<div className="w-full h-full bg-[#121212] flex items-center justify-center text-white">Loading Metro Map...</div>}>
                  <div className="absolute inset-0 z-0">
                    <div className="absolute top-24 left-1/2 -translate-x-1/2 z-10 bg-purple-500/20 backdrop-blur-sm px-4 py-2 rounded-full border border-purple-500/30 text-white text-xs animate-pulse">
                      Click stop for Origin | Right-click for Destination
                    </div>
                    <LazyMetroMap
                      stops={stops}
                      onSelectStation={handleSelectFromMap}
                    />
                  </div>
                </Suspense>
              )
              : (
              <div className="absolute inset-0 z-0">
                <GoogleMap
                  stops={stops}
                  center={mapCenter}
                  selectedPath={selectedPath}
                  allPaths={results}
                  explorerPath={explorerPath}
                  recenterCount={recenterCount}
                  onStopSelect={(s) => handleSelectFromMap(s.stop_id, "FROM")}
                />
              </div>
              )}

            <div className="absolute top-6 right-4 md:top-auto md:bottom-10 md:left-10 md:right-auto z-[100] flex flex-col items-end md:items-start gap-3">
              <button
                onClick={() => setShowMetroMap(!showMetroMap)}
                className="bg-[#111111]/90 backdrop-blur-md px-4 py-3 md:px-6 md:py-3 rounded-full border border-purple-500/50 text-white font-bold text-xs md:text-sm shadow-2xl hover:bg-purple-600 transition-all flex items-center gap-2"
              >
                {showMetroMap
                  ? "🗺️ Map"
                  : "🚇 Schematic"}
              </button>

              {selectedPath && !showMetroMap && (
                <button
                  onClick={() => setRecenterCount(prev => prev + 1)}
                  className="bg-[#111111]/90 backdrop-blur-md px-4 py-3 md:px-6 md:py-3 rounded-full border border-emerald-400/50 text-white font-bold text-xs md:text-sm shadow-2xl hover:bg-emerald-600 transition-all flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-500"
                >
                  🎯 Center
                </button>
              )}
            </div>

            {isCalculating && (
              <div className="absolute inset-0 z-[200] bg-[#0a0a0a]/40 backdrop-blur-[2px] flex items-center justify-center rounded-[32px] pointer-events-none">
                <div className="bg-[#1e1e1e] border border-white/10 px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in zoom-in duration-300">
                  <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-[10px] font-black text-white uppercase tracking-widest">Optimizing Route...</span>
                </div>
              </div>
            )}

            {/* Bottom Sheet for Mobile / Sidebar for Desktop */}
            <div className={`
              absolute bottom-0 left-0 w-full z-[120]
              md:top-8 md:left-8 md:bottom-auto md:w-[400px]
              bg-[#111111]/95 backdrop-blur-[20px] md:rounded-[24px] rounded-t-[24px] 
              border-t border-white/10 md:border md:border-white/10
              shadow-[0_-20px_50px_rgba(0,0,0,0.5)] md:shadow-[0_20px_50px_rgba(0,0,0,0.5)]
              flex flex-col transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]
              ${results.length > 0 ? 'h-[70vh] md:h-auto md:max-h-[calc(100vh-64px)]' : 'h-[45vh] min-h-[350px] md:min-h-0 md:h-auto'}
            `}>
              {/* Pull handle for mobile */}
              <div className="w-full flex justify-center pt-2 pb-0 md:hidden shrink-0">
                 <div className="w-[48px] h-[5px] bg-[#555] rounded-full" />
              </div>

              <div className="shrink-0 w-full">
                <SearchBox
                  stops={stops}
                  onSearch={handleSearch}
                  onPlaceSelect={handlePlaceSelect}
                  onCriteriaChange={handleCriteriaChange}
                  selectedCriteria={selectedCriteria}
                  initialFrom={fromStopId}
                  initialTo={toStopId}
                  originStopName={originStopName}
                  destStopName={destStopName}
                />
              </div>

              {results.length > 0 && (
                <div className="flex-1 overflow-y-auto w-full pb-[env(safe-area-inset-bottom)] scrollbar-hide border-t border-white/5">
                  <Suspense fallback={null}>
                    <LazyRouteResults
                      results={results}
                      selectedCriteria={selectedCriteria}
                      onSelect={(path: PathResult) => setSelectedPath(path)}
                      onBusClick={handleBusClick}
                    />
                  </Suspense>
                </div>
              )}
            </div>

            <Suspense fallback={null}>
              {explorerRoute && (
                <LazyRouteExplorer
                  explorerRoute={explorerRoute}
                  onShare={() => {
                    const url = new URL(window.location.href);
                    url.searchParams.set("route", explorerRoute);
                    
                    if (navigator.share) {
                      navigator.share({
                        title: `Namma Route: Bus ${explorerRoute}`,
                        text: `Check out the schedule and route for BMTC Bus ${explorerRoute} on Namma Route!`,
                        url: url.toString()
                      }).catch((err) => console.log('Error sharing:', err));
                    } else {
                      navigator.clipboard.writeText(url.toString())
                        .then(() => {
                          alert("Shareable link copied to clipboard!");
                        })
                        .catch((err) => {
                          console.error('Clipboard write failed:', err);
                          alert("Failed to copy link. Please copy manually: " + url.toString());
                        });
                    }
                  }}
                  onClose={() => {
                    setExplorerRoute(null);
                    setExplorerPath([]);
                    const url = new URL(window.location.search);
                    url.searchParams.delete("route");
                    window.history.pushState({}, "", url.pathname + url.search);
                  }}
                />
              )}
            </Suspense>

            {(isSearching || (hasSearched && results.length === 0)) && (
              <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-[110] bg-[#1e1e1e]/90 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/10 shadow-2xl flex flex-col items-center gap-2">
                {isSearching
                  ? (
                    <>
                      <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-white text-xs font-bold">
                        Calculating Optimal Route...
                      </span>
                    </>
                  )
                  : (
                    <>
                      <span className="text-2xl">😕</span>
                      <span className="text-white text-xs font-bold">
                        No direct routes found for this time.
                      </span>
                      <span className="text-gray-500 text-[10px]">
                        Try a different starting point or time.
                      </span>
                    </>
                  )}
              </div>
            )}

            {/* Visible SEO Footer */}
            <div className="absolute bottom-4 right-8 z-[100] text-right pointer-events-none opacity-40 hover:opacity-100 transition-opacity">
              <p className="text-[9px] text-white/50 font-medium uppercase tracking-[0.2em]">
                Namma BMTC Online • Bangalore Bus Route Navigator • 378 Bus Schedule
              </p>
            </div>
          </>
        )}
    </main>
  );
}

export default App;
