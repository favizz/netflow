"use client";

import { cn } from "@/lib/utils";
import { Info, Wifi, Zap, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { ZoneDetailModal } from "./ZoneDetailModal";

interface TowerProps {
    name: string;
    totalDevices: number;
    onlineDevices: number;
    anomalies: number;
}

type TabType = "consumption" | "connectivity" | "anomaly";

export function TowerCard({ name, totalDevices, onlineDevices, anomalies }: TowerProps) {
    const [activeTab, setActiveTab] = useState<TabType>("consumption");
    const [selectedZone, setSelectedZone] = useState<{ floor: number; zone: string } | null>(null);

    // Mock Grid Data: 20 Floors x 4 Zones (A, B, C, D)
    const floors = Array.from({ length: 20 }, (_, i) => 20 - i); // 20 down to 1
    const zones = ["A", "B", "C", "D"];

    // Helper to get random intensity for mock visualization based on tab
    const getIntensity = (floor: number, zone: string) => {
        // Deterministic pseudo-random based on props for consistency during renders
        const seed = name.charCodeAt(0) + floor * 10 + zone.charCodeAt(0);
        const rand = (Math.sin(seed) * 10000) % 1;

        if (activeTab === "anomaly") {
            return rand > 0.95 ? 1.0 : 0; // Sparse anomalies
        }
        if (activeTab === "connectivity") {
            return rand > 0.9 ? 1.0 : 0; // 1.0 = offline/bad connectivity
        }
        return rand; // 0-1 for consumption
    };

    const getColorClass = (intensity: number) => {
        if (activeTab === "consumption") {
            if (intensity < 0.2) return "bg-gray-100 hover:bg-gray-200";
            if (intensity < 0.5) return "bg-blue-200 hover:bg-blue-300";
            if (intensity < 0.8) return "bg-blue-400 hover:bg-blue-500";
            return "bg-[#5E81F4] hover:bg-[#4b6bc6]";
        }
        if (activeTab === "connectivity") {
            return intensity > 0.5 ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600";
        }
        if (activeTab === "anomaly") {
            return intensity > 0.5 ? "bg-red-600 hover:bg-red-700 animate-pulse" : "bg-gray-100 hover:bg-gray-200";
        }
        return "bg-gray-100";
    };

    return (
        <>
            <div className="flex flex-col rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-900/5 h-[520px]">
                {/* Header */}
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-900">{name}</h3>
                    <div className="flex space-x-1 rounded-md bg-gray-100 p-1">
                        <button
                            onClick={() => setActiveTab("consumption")}
                            className={cn("p-1.5 rounded-sm transition-all", activeTab === "consumption" ? "bg-white text-blue-600 shadow-sm" : "text-gray-400 hover:text-gray-600")}
                            title="Utility Consumption"
                        >
                            <Zap className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => setActiveTab("connectivity")}
                            className={cn("p-1.5 rounded-sm transition-all", activeTab === "connectivity" ? "bg-white text-blue-600 shadow-sm" : "text-gray-400 hover:text-gray-600")}
                            title="IoT Connectivity"
                        >
                            <Wifi className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => setActiveTab("anomaly")}
                            className={cn("p-1.5 rounded-sm transition-all", activeTab === "anomaly" ? "bg-white text-blue-600 shadow-sm" : "text-gray-400 hover:text-gray-600")}
                            title="Anomalies & Fraud"
                        >
                            <AlertTriangle className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {/* Heatmap Grid */}
                <div className="mb-4 flex-1 overflow-hidden flex flex-col">
                    <div className="flex flex-1">
                        {/* Y-Axis Label */}
                        <div className="mr-2 flex flex-col justify-between text-[10px] text-gray-400 font-mono py-0.5">
                            {floors.map(f => (
                                <span key={f} className="leading-none text-right w-4">L{f}</span>
                            ))}
                        </div>

                        {/* Grid */}
                        <div className="flex-1 grid grid-cols-4 gap-1">
                            {floors.map((floor) => (
                                zones.map((zone) => {
                                    const intensity = getIntensity(floor, zone);
                                    return (
                                        <div
                                            key={`${floor}-${zone}`}
                                            onClick={() => setSelectedZone({ floor, zone })}
                                            className={cn(
                                                "rounded-sm cursor-pointer transition-colors relative group w-full h-full",
                                                getColorClass(intensity)
                                            )}
                                        >
                                            {/* Tooltip Logic via Group Hover to limit DOM weight */}
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10 hidden group-hover:block border border-gray-700 shadow-lg">
                                                <span className="font-semibold block">Floor {floor}, Zone {zone}</span>
                                                {activeTab === 'consumption' && `Usage: ${(intensity * 100).toFixed(0)}%`}
                                                {activeTab === 'connectivity' && (intensity > 0.5 ? 'Signal: Weak' : 'Signal: Good')}
                                                {activeTab === 'anomaly' && (intensity > 0.5 ? 'Alert: Detected' : 'Status: OK')}
                                            </div>
                                        </div>
                                    );
                                })
                            ))}
                        </div>
                    </div>
                    {/* X-Axis Labels */}
                    <div className="ml-8 mt-2 grid grid-cols-4">
                        {zones.map(z => <span key={z} className="text-center text-[10px] text-gray-400 font-mono uppercase">Zone {z}</span>)}
                    </div>
                </div>

                {/* Legend */}
                <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                    <span className="text-xs font-medium text-gray-500 capitalize">{activeTab} Intensity</span>
                    <div className="flex items-center space-x-2">
                        <span className="text-[10px] text-gray-400">Low/Good</span>
                        {activeTab === 'consumption' && <div className="h-2 w-24 bg-gradient-to-r from-blue-100 via-blue-400 to-[#5E81F4] rounded-full" />}
                        {activeTab === 'connectivity' && <div className="h-2 w-24 bg-gradient-to-r from-green-500 to-red-500 rounded-full" />}
                        {activeTab === 'anomaly' && <div className="h-2 w-24 bg-gradient-to-r from-gray-100 via-gray-100 to-red-600 rounded-full" />}
                        <span className="text-[10px] text-gray-400">High/Crit</span>
                    </div>
                </div>
            </div>

            <ZoneDetailModal
                isOpen={!!selectedZone}
                onClose={() => setSelectedZone(null)}
                towerName={name}
                floor={selectedZone?.floor || 0}
                zone={selectedZone?.zone || ""}
            />
        </>
    );
}
