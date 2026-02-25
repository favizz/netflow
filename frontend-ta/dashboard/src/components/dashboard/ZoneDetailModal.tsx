"use client";

import { X, Zap, Droplets, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface UnitStatus {
    unitId: string;
    tenant: string;
    electricity: "normal" | "warning" | "critical";
    water: "normal" | "warning" | "critical";
    status: "online" | "offline";
    anomalies: string[];
}

interface ZoneDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    towerName: string;
    floor: number;
    zone: string;
}

// Mock data generator
const getMockUnits = (tower: string, floor: number, zone: string): UnitStatus[] => {
    return Array.from({ length: 6 }).map((_, i) => ({
        unitId: `${tower}-${floor}${zone}${i + 1}`,
        tenant: "Occupied",
        electricity: Math.random() > 0.8 ? "warning" : "normal",
        water: Math.random() > 0.9 ? "critical" : "normal",
        status: Math.random() > 0.9 ? "offline" : "online",
        anomalies: Math.random() > 0.9 ? ["Voltage Spike"] : [],
    }));
};

export function ZoneDetailModal({ isOpen, onClose, towerName, floor, zone }: ZoneDetailModalProps) {
    if (!isOpen) return null;

    const units = getMockUnits(towerName, floor, zone);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg rounded-lg bg-white shadow-xl ring-1 ring-gray-900/5 animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between border-b border-gray-100 p-4">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                            {towerName} - Floor {floor} (Zone {zone})
                        </h3>
                        <p className="text-sm text-gray-500">Unit Details & Status</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-4">
                    <div className="space-y-3">
                        {units.map((unit) => (
                            <div
                                key={unit.unitId}
                                className="flex items-center justify-between rounded-md border border-gray-100 p-3 hover:bg-gray-50"
                            >
                                <div className="flex items-center space-x-3">
                                    <div
                                        className={cn(
                                            "h-2.5 w-2.5 rounded-full",
                                            unit.status === "online" ? "bg-green-500" : "bg-red-500"
                                        )}
                                        title={unit.status === "online" ? "Online" : "Offline"}
                                    />
                                    <div>
                                        <div className="font-medium text-gray-900">{unit.unitId}</div>
                                        <div className="text-xs text-gray-500">{unit.tenant}</div>
                                    </div>
                                </div>

                                <div className="flex items-center space-x-4">
                                    {/* Status Icons */}
                                    <div className="flex space-x-2">
                                        <div className={cn("p-1.5 rounded-full", unit.electricity === 'normal' ? "bg-blue-50 text-blue-600" : "bg-red-50 text-red-600")}>
                                            <Zap className="h-4 w-4" />
                                        </div>
                                        <div className={cn("p-1.5 rounded-full", unit.water === 'normal' ? "bg-cyan-50 text-cyan-600" : "bg-red-50 text-red-600")}>
                                            <Droplets className="h-4 w-4" />
                                        </div>
                                    </div>
                                    {unit.anomalies.length > 0 && (
                                        <div className="flex items-center text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded-full">
                                            <AlertTriangle className="h-3 w-3 mr-1" />
                                            {unit.anomalies[0]}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="border-t border-gray-100 p-4 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-md"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
