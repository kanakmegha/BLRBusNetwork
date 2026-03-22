/// <reference types="@types/google.maps" />
import { useEffect, useRef, useState } from "react";
import type { Stop } from "../engine/types";

interface SearchBoxProps {
    stops: Stop[];
    onSearch: (from: string, to: string) => void;
    onPlaceSelect?: (lat: number, lng: number) => void;
    onSortChange?: (option: "TIME" | "FARE" | "TRANSFERS") => void;
    sortBy?: "TIME" | "FARE" | "TRANSFERS";
    initialFrom?: string;
    initialTo?: string;
    destStopName?: string | null;
}

export function SearchBox(
    {
        stops,
        onSearch,
        onPlaceSelect,
        onSortChange,
        sortBy = "TIME",
        initialFrom,
        initialTo,
        destStopName,
    }: SearchBoxProps,
) {
    const [from, setFrom] = useState(initialFrom || "");
    const [to, setTo] = useState(initialTo || "");
    const [isGeocoding, setIsGeocoding] = useState(false);
    const toInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (initialFrom) setFrom(initialFrom);
    }, [initialFrom]);

    useEffect(() => {
        if (initialTo) setTo(initialTo);
    }, [initialTo]);

    useEffect(() => {
        if (toInputRef.current && (window as any).google) {
            const autocomplete = new (window as any).google.maps.places
                .Autocomplete(toInputRef.current, {
                componentRestrictions: { country: "IN" },
                fields: ["geometry", "name"],
                types: ["geocode", "establishment"],
            });

            autocomplete.addListener("place_changed", () => {
                const place = autocomplete.getPlace();
                if (place.geometry?.location && onPlaceSelect) {
                    onPlaceSelect(
                        place.geometry.location.lat(),
                        place.geometry.location.lng(),
                    );
                }
            });
        }
    }, [onPlaceSelect]);

    const handleKeyDown = async (e: React.KeyboardEvent) => {
        if (
            e.key === "Enter" && toInputRef.current?.value &&
            (window as any).google
        ) {
            const address = toInputRef.current.value;
            setIsGeocoding(true);
            const geocoder = new (window as any).google.maps.Geocoder();
            geocoder.geocode({
                address,
                componentRestrictions: { country: "IN" },
            }, (results: any, status: any) => {
                setIsGeocoding(false);
                if (status === "OK" && results[0] && onPlaceSelect) {
                    const loc = results[0].geometry.location;
                    onPlaceSelect(loc.lat(), loc.lng());
                }
            });
        }
    };

    const handleSearch = () => {
        if (from && to) onSearch(from, to);
    };

    return (
        <div className="absolute top-6 left-6 z-[100] w-80 bg-[#1e1e1e]/90 backdrop-blur-xl p-6 rounded-3xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] space-y-5">
            <div className="flex justify-between items-center">
                <h1 className="text-xl font-black text-white tracking-tight font-['Outfit']">
                    Namma <span className="text-purple-500">Route</span>
                </h1>
                <div className="flex gap-2">
                    {[
                        { id: "TIME", label: "Fastest", icon: "⚡" },
                        { id: "FARE", label: "Min Fare", icon: "₹" },
                        {
                            id: "TRANSFERS",
                            label: "Min Interchange",
                            icon: "🔄",
                        },
                    ].map((opt) => (
                        <button
                            key={opt.id}
                            onClick={() => onSortChange?.(opt.id as any)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all ${
                                sortBy === opt.id
                                    ? "bg-purple-600 text-white shadow-lg shadow-purple-500/30 border-purple-400"
                                    : "bg-[#121212] text-gray-400 border border-white/5 hover:border-purple-500/50"
                            }`}
                        >
                            <span>{opt.label}</span>
                            {sortBy === opt.id && (
                                <span className="text-xs">✓</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-1">
                    Origin
                </label>
                <select
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="w-full bg-[#121212] text-white border border-white/5 rounded-2xl p-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all font-medium appearance-none"
                >
                    <option value="">Detecting location...</option>
                    {stops.map((s) => (
                        <option key={s.stop_id} value={s.stop_id}>
                            {s.stop_name}
                        </option>
                    ))}
                </select>
            </div>

            <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-1">
                    Destination
                </label>
                <div className="relative group">
                    <input
                        ref={toInputRef}
                        type="text"
                        onKeyDown={handleKeyDown}
                        placeholder="Search landmark or area..."
                        className="w-full bg-[#121212] text-white border border-white/5 rounded-2xl p-3.5 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all font-medium placeholder:text-gray-600"
                    />
                    <div className="absolute left-3.5 top-[15px] text-gray-600 group-focus-within:text-purple-500 transition-colors">
                        {isGeocoding
                            ? (
                                <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                            )
                            : (
                                <svg
                                    className="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                    />
                                </svg>
                            )}
                    </div>
                </div>
                {destStopName && (
                    <div className="flex items-center gap-2 mt-1 px-1">
                        <span className="text-[10px] text-purple-400 font-bold bg-purple-500/10 px-2 py-0.5 rounded-full">
                            NEAREST STOP
                        </span>
                        <span className="text-[10px] text-gray-400 font-medium truncate">
                            {destStopName}
                        </span>
                    </div>
                )}
            </div>

            <button
                onClick={handleSearch}
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold py-4 rounded-2xl transition-all shadow-[0_10px_20px_rgba(124,58,237,0.3)] active:scale-[0.98] text-sm tracking-wide"
            >
                Find Optimal Path
            </button>
        </div>
    );
}
