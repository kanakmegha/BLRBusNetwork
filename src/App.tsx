import { useEffect, useState } from "react";
import { Map as GoogleMap } from "./components/Map";
import { MetroMap } from "./components/MetroMap";
import { SearchBox } from "./components/SearchBox";
import { RouteResults } from "./components/RouteResults";
import { JourneyDetails } from "./components/JourneyDetails";
import { useTransit } from "./hooks/useTransit";
import type { PathResult, TransitFilter } from "./engine/types";
import "./App.css";

function App() {
  const { isReady, error, isCalculating, stops, findRoute, findNearestStop, dataManager } = useTransit();
  const [results, setResults] = useState<PathResult[]>([]);
  const [selectedPath, setSelectedPath] = useState<PathResult | null>(null);
  const [stopMap, setStopMap] = useState<Map<string, any>>(new Map());
  const [showMetroMap, setShowMetroMap] = useState(false);
  const [fromStopId, setFromStopId] = useState("");
  const [toStopId, setToStopId] = useState("");
  const [selectedCriteria, setSelectedCriteria] = useState<TransitFilter>("FASTEST");
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({
    lat: 12.9716,
    lng: 77.5946,
  });
  const [destStopName, setDestStopName] = useState<string | null>(null);

  if (error) {
    return (
      <div className="h-screen w-screen bg-[#0a0a0a] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#1e1e1e] border border-red-500/20 rounded-[32px] p-10 text-center shadow-[0_32px_64px_-16px_rgba(255,0,0,0.1)]">
          <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-black text-white mb-2 tracking-tight">Data Load Failed</h2>
          <p className="text-gray-400 text-sm mb-8 leading-relaxed">
            {error}
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-white text-black font-black py-4 rounded-2xl hover:bg-gray-200 transition-colors uppercase tracking-widest text-xs"
          >
            Retry Connection
          </button>
          <p className="mt-6 text-[10px] text-gray-600 uppercase tracking-widest font-bold">
            BLR Transit Diagnostic System
          </p>
        </div>
      </div>
    );
  }

  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    if (isReady && stops.length > 0) {
      const map = new Map();
      stops.forEach(s => map.set(s.stop_id, s));
      setStopMap(map);

      if (!fromStopId) {
        navigator.geolocation.getCurrentPosition((pos) => {
          const { latitude, longitude } = pos.coords;
          const nearest = findNearestStop(latitude, longitude);
          if (nearest) {
            setFromStopId(nearest.stop_id);
            setMapCenter({ lat: latitude, lng: longitude });
          }
        }, (err) => {
          console.warn("Geolocation failed:", err);
        });
      }
    }
  }, [isReady, findNearestStop, fromStopId, stops]);

  const handleSearch = async (fromValue: string, toValue: string) => {
    if (!fromValue || !toValue) return;
    
    // Safety Net: 5-character LFS check ('versi' check)
    try {
      const response = await fetch("/data/metro_stops.json");
      const text = await response.text();
      if (text.trim().startsWith("versi")) {
        alert("Data Error: LFS Pointer detected. Perform a Clean Build.");
        return;
      }
    } catch (e) {
      console.error("LFS check failed", e);
    }

    // Ensure Deep Search: Clear previous results and states entirely
    setIsSearching(true);
    setHasSearched(false);
    setResults([]);
    setSelectedPath(null);

    const pathResults = await findRoute(fromValue, toValue, "08:00:00", selectedCriteria);
    
    setResults(pathResults);
    setHasSearched(true);
    
    if (pathResults.length > 0) {
      setSelectedPath(pathResults[0]);
    }
    setIsSearching(false);
  };

  const handleCriteriaChange = (criteria: TransitFilter) => {
    // ONLY update the UI state (Draft State)
    setSelectedCriteria(criteria);
  };

  const handleDestinationPlaceSelect = (lat: number, lng: number) => {
    const nearest = findNearestStop(lat, lng);
    if (nearest) {
      setToStopId(nearest.stop_id);
      setDestStopName(nearest.stop_name);
      // LOCKDOWN: no auto-search here
    }
  };

  const handleSelectFromMap = (stopId: string, type: "FROM" | "TO") => {
    if (type === "FROM") {
      setFromStopId(stopId);
    } else {
      const stop = stops.find((s) => s.stop_id === stopId);
      setToStopId(stopId);
      setDestStopName(stop?.stop_name || null);
    }
    // LOCKDOWN: no auto-search here
  };

  return (
    <main className="relative w-full h-screen bg-[#121212] flex flex-col items-center justify-center overflow-hidden">
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
      ) : !isReady ? (
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin">
          </div>
          <p className="text-white font-medium animate-pulse">
            Syncing Bengaluru Transit Data...
          </p>
        </div>
      ) : (
          <>
            {showMetroMap
              ? (
                <div className="absolute inset-0 z-0">
                  <div className="absolute top-24 left-1/2 -translate-x-1/2 z-10 bg-purple-500/20 backdrop-blur-sm px-4 py-2 rounded-full border border-purple-500/30 text-white text-xs animate-pulse">
                    Click stop for Origin | Right-click for Destination
                  </div>
                  <MetroMap
                    stops={stops}
                    onSelectStation={handleSelectFromMap}
                  />
                </div>
              )
              : (
                <GoogleMap
                  stops={stops}
                  center={mapCenter}
                  selectedPath={selectedPath}
                  onStopSelect={(s) => handleSelectFromMap(s.stop_id, "FROM")}
                />
              )}

            <button
              onClick={() => setShowMetroMap(!showMetroMap)}
              className="absolute bottom-10 left-10 z-[100] bg-[#1e1e1e]/90 backdrop-blur-md px-6 py-3 rounded-full border border-purple-500/50 text-white font-bold text-sm shadow-2xl hover:bg-purple-600 transition-all flex items-center gap-2"
            >
              {showMetroMap
                ? "🗺️ Switch to Google Map"
                : "🚇 Switch to Schematic View"}
            </button>

            {isCalculating && (
              <div className="absolute inset-0 z-[200] bg-[#0a0a0a]/40 backdrop-blur-[2px] flex items-center justify-center rounded-[32px] pointer-events-none">
                <div className="bg-[#1e1e1e] border border-white/10 px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in zoom-in duration-300">
                  <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-[10px] font-black text-white uppercase tracking-widest">Optimizing Route...</span>
                </div>
              </div>
            )}

            <h1 className="sr-only">
              BLR Transit: Find Bangalore BMTC Bus Routes and Metro Directions
            </h1>
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-4 w-full px-4 max-w-2xl">
              <SearchBox
                stops={stops}
                onSearch={handleSearch}
                onPlaceSelect={handleDestinationPlaceSelect}
                onCriteriaChange={handleCriteriaChange}
                selectedCriteria={selectedCriteria}
                initialFrom={fromStopId}
                initialTo={toStopId}
                destStopName={destStopName}
              />
            </div>

            <RouteResults
              results={results}
              selectedCriteria={selectedCriteria}
              onSelect={(path) => setSelectedPath(path)}
              dataManager={dataManager}
            />

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

            {selectedPath && (
              <JourneyDetails
                selectedPath={selectedPath}
                stopMap={stopMap}
                dataManager={dataManager}
                onClose={() => setSelectedPath(null)}
              />
            )}
          </>
        )}
    </main>
  );
}

export default App;
