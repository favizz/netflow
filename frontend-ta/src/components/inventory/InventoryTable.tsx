"use client";

import { useState, useMemo } from "react";
import { Search, Power, Droplets, MoreHorizontal, Filter, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

import { InventoryItem } from "@/lib/mockData";
import { useRouter } from "next/navigation";

// export interface InventoryItem { ... } // Removed, imported from shared library


interface InventoryTableProps {
    data: InventoryItem[];
    // onToggleUtility is removed or optional/unused for now
    onToggleUtility?: (id: string, type: "power" | "water") => void;
}

export function InventoryTable({ data }: InventoryTableProps) {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<"All" | "Online" | "Offline">("All");
    const [isFilterOpen, setIsFilterOpen] = useState(false);

    const filteredData = useMemo(() => {
        return data.filter((item) => {
            const matchesSearch =
                item.tenant.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.unit.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.meterSerial.toLowerCase().includes(searchQuery.toLowerCase());

            const matchesFilter = statusFilter === "All" || item.status === statusFilter;

            return matchesSearch && matchesFilter;
        });
    }, [data, searchQuery, statusFilter]);

    return (
        <div className="rounded-lg bg-white shadow-sm ring-1 ring-gray-900/5">
            {/* Header & Filters */}
            <div className="border-b border-gray-200 px-6 py-4">
                <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
                    <h2 className="text-base font-semibold leading-7 text-gray-900">Device Inventory & Control</h2>
                    <div className="flex space-x-3">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-900" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search unit, tenant, or serial..."
                                className="h-9 w-64 rounded-md border text-gray-900 border-gray-200 pl-9 pr-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                            />
                        </div>
                        <div className="relative">
                            <button
                                onClick={() => setIsFilterOpen(!isFilterOpen)}
                                className="flex items-center space-x-2 rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                            >
                                <Filter className="h-4 w-4" />
                                <span>{statusFilter === "All" ? "Filter" : statusFilter}</span>
                                <ChevronDown className="h-4 w-4 ml-1" />
                            </button>
                            {isFilterOpen && (
                                <div className="absolute right-0 mt-2 w-40 rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 z-10">
                                    {["All", "Online", "Offline"].map((status) => (
                                        <button
                                            key={status}
                                            onClick={() => {
                                                setStatusFilter(status as any);
                                                setIsFilterOpen(false);
                                            }}
                                            className={cn(
                                                "block w-full px-4 py-2 text-left text-sm hover:bg-gray-50",
                                                statusFilter === status ? "text-primary font-medium" : "text-gray-700"
                                            )}
                                        >
                                            {status}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-500">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-700">
                        <tr>
                            <th className="px-6 py-3 font-medium">Unit / Tenant</th>
                            <th className="px-6 py-3 font-medium">Meter Serial</th>
                            <th className="px-6 py-3 font-medium">Status</th>
                            <th className="px-6 py-3 font-medium">Utilities State</th>
                            <th className="px-6 py-3 font-medium">Last Update</th>
                            <th className="px-6 py-3 font-medium text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {filteredData.length > 0 ? (
                            filteredData.map((item) => (
                                <tr
                                    key={item.id}
                                    className="hover:bg-gray-50 cursor-pointer"
                                    onClick={() => router.push(`/inventory/${item.id}`)}
                                >
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-gray-900">{item.unit}</div>
                                        <div className="text-xs">{item.tenant}</div>
                                    </td>
                                    <td className="px-6 py-4 font-mono text-xs">{item.meterSerial}</td>
                                    <td className="px-6 py-4">
                                        <span
                                            className={cn(
                                                "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset",
                                                item.status === "Online"
                                                    ? "bg-green-50 text-green-700 ring-green-600/20"
                                                    : "bg-red-50 text-red-700 ring-red-600/20"
                                            )}
                                        >
                                            {item.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex space-x-2">
                                            <div
                                                className={cn(
                                                    "flex h-8 w-8 items-center justify-center rounded-md border transition-colors",
                                                    item.power
                                                        ? "border-primary bg-primary/10 text-primary"
                                                        : "border-gray-200 bg-gray-50 text-gray-400"
                                                )}
                                                title={item.power ? "Power ON" : "Power OFF"}
                                            >
                                                <Power className="h-4 w-4" />
                                            </div>
                                            <div
                                                className={cn(
                                                    "flex h-8 w-8 items-center justify-center rounded-md border transition-colors",
                                                    item.water
                                                        ? "border-cyan-500 bg-cyan-50 text-cyan-600"
                                                        : "border-gray-200 bg-gray-50 text-gray-400"
                                                )}
                                                title={item.water ? "Water ON" : "Water OFF"}
                                            >
                                                <Droplets className="h-4 w-4" />
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">{item.lastUpdate}</td>
                                    <td className="px-6 py-4 text-right">
                                        <button className="text-gray-400 hover:text-gray-600">
                                            <MoreHorizontal className="h-5 w-5" />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                                    No devices found matching your search.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4">
                <div className="text-sm text-gray-500">
                    Showing <span className="font-medium text-gray-900">{filteredData.length}</span> results
                </div>
                <div className="flex space-x-2">
                    <button disabled className="rounded-md border border-gray-200 px-3 py-1 text-sm font-medium text-gray-400 disabled:opacity-50">Previous</button>
                    <button disabled className="rounded-md border border-gray-200 px-3 py-1 text-sm font-medium text-gray-400 disabled:opacity-50">Next</button>
                </div>
            </div>
        </div>
    );
}
