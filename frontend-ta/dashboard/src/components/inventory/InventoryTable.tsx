import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Power, Droplets, ChevronDown, ChevronLeft, ChevronRight, Filter, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { InventoryItem } from "@/lib/mockData";

const PAGE_SIZE = 10;

interface InventoryTableProps {
    data: InventoryItem[];
    initialFilter?: string;
    onEdit?: (item: InventoryItem) => void;
    onDelete?: (item: InventoryItem) => void;
}

export function InventoryTable({ data, initialFilter = "", onEdit, onDelete }: InventoryTableProps) {
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState(initialFilter);
    const [statusFilter, setStatusFilter] = useState<"All" | "Online" | "Offline">("All");
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [page, setPage] = useState(1);

    const filteredData = useMemo(() => {
        setPage(1);
        return data.filter((item) => {
            const matchesSearch =
                item.tenant.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.unit.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.meterSerial.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesFilter = statusFilter === "All" || item.status === statusFilter;
            return matchesSearch && matchesFilter;
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, searchQuery, statusFilter]);

    const totalPages = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE));
    const pageData = filteredData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const start = filteredData.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
    const end = Math.min(page * PAGE_SIZE, filteredData.length);

    return (
        <div className="rounded-lg bg-white dark:bg-gray-800 shadow-sm ring-1 ring-gray-900/5 dark:ring-gray-700">
            <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4">
                <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Device Inventory &amp; Control</h2>
                    <div className="flex space-x-3">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400 dark:text-gray-500" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search unit, tenant, or serial..."
                                className="h-9 w-64 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 pl-9 pr-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-gray-400 dark:placeholder:text-gray-500"
                            />
                        </div>
                        <div className="relative">
                            <button
                                onClick={() => setIsFilterOpen(!isFilterOpen)}
                                className="flex items-center space-x-2 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600"
                            >
                                <Filter className="h-4 w-4" />
                                <span>{statusFilter === "All" ? "Filter" : statusFilter}</span>
                                <ChevronDown className="h-4 w-4 ml-1" />
                            </button>
                            {isFilterOpen && (
                                <div className="absolute right-0 mt-2 w-40 rounded-md bg-white dark:bg-gray-800 py-1 shadow-lg ring-1 ring-black ring-opacity-5 dark:ring-gray-600 z-10">
                                    {(["All", "Online", "Offline"] as const).map((status) => (
                                        <button
                                            key={status}
                                            onClick={() => { setStatusFilter(status); setIsFilterOpen(false); }}
                                            className={cn(
                                                "block w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700",
                                                statusFilter === status ? "text-primary font-medium" : "text-gray-700 dark:text-gray-300"
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

            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-500 dark:text-gray-400">
                    <thead className="bg-gray-50 dark:bg-gray-800/60 text-xs uppercase text-gray-700 dark:text-gray-400">
                        <tr>
                            <th className="px-6 py-3 font-medium">Unit / Tenant</th>
                            <th className="px-6 py-3 font-medium">Device ID</th>
                            <th className="px-6 py-3 font-medium">Status</th>
                            <th className="px-6 py-3 font-medium">Utilities</th>
                            <th className="px-6 py-3 font-medium text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {pageData.length > 0 ? (
                            pageData.map((item) => (
                                <tr
                                    key={item.id}
                                    className="hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer"
                                    onClick={() => navigate(`/devices/${item.id}`)}
                                >
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-gray-900 dark:text-gray-100">{item.unit}</div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">{item.tenant}</div>
                                    </td>
                                    <td className="px-6 py-4 font-mono text-xs">{item.meterSerial}</td>
                                    <td className="px-6 py-4">
                                        <span className={cn(
                                            "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset",
                                            item.status === "Online"
                                                ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 ring-green-600/20"
                                                : "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 ring-red-600/20"
                                        )}>
                                            {item.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex space-x-2">
                                            <div className={cn("flex h-8 w-8 items-center justify-center rounded-md border transition-colors",
                                                item.power ? "border-primary bg-primary/10 text-primary" : "border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-400"
                                            )} title={item.power ? "Power ON" : "Power OFF"}>
                                                <Power className="h-4 w-4" />
                                            </div>
                                            <div className={cn("flex h-8 w-8 items-center justify-center rounded-md border transition-colors",
                                                item.water ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400" : "border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-400"
                                            )} title={item.water ? "Water ON" : "Water OFF"}>
                                                <Droplets className="h-4 w-4" />
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end space-x-2">
                                            <button
                                                className="rounded-md border border-gray-200 dark:border-gray-600 px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                                onClick={(e) => { e.stopPropagation(); navigate(`/devices/${item.id}`); }}
                                            >
                                                Detail
                                            </button>
                                            {onEdit && (
                                                <button
                                                    className="rounded-md border border-blue-200 dark:border-blue-800 px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                                    onClick={(e) => { e.stopPropagation(); onEdit(item); }}
                                                    title="Edit unit"
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </button>
                                            )}
                                            {onDelete && (
                                                <button
                                                    className="rounded-md border border-red-200 dark:border-red-800 px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                                    onClick={(e) => { e.stopPropagation(); onDelete(item); }}
                                                    title="Delete unit"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={5} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                                    No devices found matching your search.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 px-6 py-4">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                    {filteredData.length === 0 ? "No results" : `Showing ${start}–${end} of ${filteredData.length}`}
                </div>
                <div className="flex items-center space-x-2">
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="flex items-center rounded-md border border-gray-200 dark:border-gray-600 px-3 py-1 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft className="h-4 w-4 mr-1" /> Prev
                    </button>
                    <span className="text-sm text-gray-500 dark:text-gray-400">{page} / {totalPages}</span>
                    <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="flex items-center rounded-md border border-gray-200 dark:border-gray-600 px-3 py-1 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Next <ChevronRight className="h-4 w-4 ml-1" />
                    </button>
                </div>
            </div>
        </div>
    );
}
