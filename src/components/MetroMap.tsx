import { useMemo, useState } from "react";
import type { Stop } from "../engine/types";

interface MetroMapProps {
    stops: Stop[];
    onSelectStation: (stopId: string, type: "FROM" | "TO") => void;
}

export function MetroMap({ stops, onSelectStation }: MetroMapProps) {
    const [hovered, setHovered] = useState<string | null>(null);

    // Simplified schematic coordinates (stylized)
    const coords: Record<string, [number, number]> = useMemo(() => {
        const map: Record<string, [number, number]> = {};

        // MAJESTIC at center
        map["MAST"] = [500, 500];

        // PURPLE LINE (Horizontal-ish)
        // Left side (West)
        const purpleWest = [
            "CHAL",
            "KENG",
            "KGBT",
            "PATA",
            "JNAN",
            "RRNG",
            "NAYA",
            "MYRD",
            "DPNJ",
            "ATTG",
            "VIJN",
            "HOSH",
            "MGRD",
            "CRLY",
        ];
        purpleWest.reverse().forEach((id, idx) => {
            map[id] = [500 - (idx + 1) * 30, 500];
        });
        // Right side (East)
        const purpleEast = [
            "SMVT",
            "VDSU",
            "CUBP",
            "MGRC",
            "TRIN",
            "HALA",
            "INDR",
            "SVRD",
            "BAYP",
            "BENN",
            "KRPR",
            "SING",
            "GARD",
            "HOOD",
            "SEET",
            "KUND",
            "NALL",
            "SSSH",
            "HFCS",
            "KTPK",
            "WFKD",
        ];
        purpleEast.forEach((id, idx) => {
            map[id] = [500 + (idx + 1) * 30, 500];
        });

        // GREEN LINE (Vertical-ish)
        // Top side (North)
        const greenNorth = [
            "MADA",
            "CHIK",
            "MANJ",
            "NAGA",
            "DASA",
            "JALA",
            "PNYI",
            "PENY",
            "YPNI",
            "YSPK",
            "SNDL",
            "MALK",
            "RJNR",
            "KVPU",
            "SRMP",
            "SMPG",
        ];
        greenNorth.reverse().forEach((id, idx) => {
            map[id] = [500, 500 - (idx + 1) * 30];
        });
        // Bottom side (South)
        const greenSouth = [
            "CHCK",
            "KRMT",
            "NTLC",
            "LALB",
            "SECN",
            "JYNR",
            "RVRD",
            "BANA",
            "JPNR",
            "ELCH",
            "KNKC",
            "DODD",
            "VAJR",
            "THAL",
            "SILK",
        ];
        greenSouth.forEach((id, idx) => {
            map[id] = [500, 500 + (idx + 1) * 30];
        });

        // YELLOW LINE (Diagonal from RV Road)
        const yellow = [
            "RAGI",
            "JAYD",
            "BTML",
            "CSLB",
            "BOMM",
            "HONG",
            "KUDL",
            "SING_Y",
            "HOSR",
            "BERA",
            "ECP1",
            "ECP2",
            "HUSK",
            "HEBB",
            "BOMS",
        ];
        const rvPos = map["RVRD"] || [500, 710]; // fallback
        yellow.forEach((id, idx) => {
            map[id] = [rvPos[0] + (idx + 1) * 20, rvPos[1] + (idx + 1) * 20];
        });

        return map;
    }, []);

    const lines = [
        { code: "PURPLE", color: "#a855f7" },
        { code: "GREEN", color: "#22c55e" },
        { code: "YELLOW", color: "#eab308" },
    ];

    const getLineStops = (code: string) => {
        if (code === "PURPLE") {
            return [
                "CHAL",
                "KENG",
                "KGBT",
                "PATA",
                "JNAN",
                "RRNG",
                "NAYA",
                "MYRD",
                "DPNJ",
                "ATTG",
                "VIJN",
                "HOSH",
                "MGRD",
                "CRLY",
                "MAST",
                "SMVT",
                "VDSU",
                "CUBP",
                "MGRC",
                "TRIN",
                "HALA",
                "INDR",
                "SVRD",
                "BAYP",
                "BENN",
                "KRPR",
                "SING",
                "GARD",
                "HOOD",
                "SEET",
                "KUND",
                "NALL",
                "SSSH",
                "HFCS",
                "KTPK",
                "WFKD",
            ];
        }
        if (code === "GREEN") {
            return [
                "MADA",
                "CHIK",
                "MANJ",
                "NAGA",
                "DASA",
                "JALA",
                "PNYI",
                "PENY",
                "YPNI",
                "YSPK",
                "SNDL",
                "MALK",
                "RJNR",
                "KVPU",
                "SRMP",
                "SMPG",
                "MAST",
                "CHCK",
                "KRMT",
                "NTLC",
                "LALB",
                "SECN",
                "JYNR",
                "RVRD",
                "BANA",
                "JPNR",
                "ELCH",
                "KNKC",
                "DODD",
                "VAJR",
                "THAL",
                "SILK",
            ];
        }
        if (code === "YELLOW") {
            return [
                "RVRD",
                "RAGI",
                "JAYD",
                "BTML",
                "CSLB",
                "BOMM",
                "HONG",
                "KUDL",
                "SING_Y",
                "HOSR",
                "BERA",
                "ECP1",
                "ECP2",
                "HUSK",
                "HEBB",
                "BOMS",
            ];
        }
        return [];
    };

    return (
        <div className="w-full h-full bg-[#121212] overflow-auto flex items-center justify-center p-12 scrollbar-hide">
            <svg
                viewBox="0 0 1200 1000"
                className="w-[1200px] h-[1000px] select-none"
            >
                {/* Draw Lines */}
                {lines.map((line) => {
                    const lineStops = getLineStops(line.code);
                    const points = lineStops
                        .map((id) => coords[id])
                        .filter(Boolean)
                        .map((p) => `${p[0]},${p[1]}`)
                        .join(" ");

                    return (
                        <polyline
                            key={line.code}
                            points={points}
                            fill="none"
                            stroke={line.color}
                            strokeWidth="6"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            className="opacity-60 transition-opacity hover:opacity-100"
                        />
                    );
                })}

                {/* Draw Interchanges */}
                {["MAST", "RVRD"].map((id) => {
                    const p = coords[id];
                    if (!p) return null;
                    return (
                        <circle
                            key={`interchange-${id}`}
                            cx={p[0]}
                            cy={p[1]}
                            r="12"
                            fill="#121212"
                            stroke="white"
                            strokeWidth="3"
                        />
                    );
                })}

                {/* Draw Station Nodes */}
                {stops.filter((s) => s.line_code).map((s) => {
                    const p = coords[s.stop_id];
                    if (!p) return null;

                    const isHovered = hovered === s.stop_id;
                    const lineColor = lines.find((l) =>
                        l.code === s.line_code
                    )?.color || "#fff";

                    return (
                        <g
                            key={s.stop_id}
                            className="cursor-pointer"
                            onMouseEnter={() => setHovered(s.stop_id)}
                            onMouseLeave={() => setHovered(null)}
                            onClick={() => onSelectStation(s.stop_id, "FROM")}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                onSelectStation(s.stop_id, "TO");
                            }}
                        >
                            <circle
                                cx={p[0]}
                                cy={p[1]}
                                r={isHovered ? "8" : "5"}
                                fill={lineColor}
                                className="transition-all duration-200"
                            />
                            {isHovered && (
                                <g>
                                    <rect
                                        x={p[0] + 10}
                                        y={p[1] - 30}
                                        width={s.stop_name.length * 8 + 20}
                                        height="24"
                                        rx="12"
                                        fill="#1e1e1e"
                                        stroke="#333"
                                    />
                                    <text
                                        x={p[0] + 20}
                                        y={p[1] - 14}
                                        fill="white"
                                        fontSize="12"
                                        fontWeight="bold"
                                    >
                                        {s.stop_name}
                                    </text>
                                    <text
                                        x={p[0] + 20}
                                        y={p[1] + 20}
                                        fill="#666"
                                        fontSize="8"
                                    >
                                        L-Click: Start | R-Click: End
                                    </text>
                                </g>
                            )}
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}
