import { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Search, Power, Droplets, ChevronDown, ChevronLeft, ChevronRight, Pencil, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { InventoryItem } from "@/lib/mockData";
import { PAGE_SIZE } from "@/lib/constants";

function FilterDropdown({ label, options, value, onChange }: {
    label: string; options: string[]; value: string; onChange: (v: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [dropPos, setDropPos] = useState({ top: 0, right: 0 });
    const btnRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => {
            if (!btnRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);

    const handleToggle = () => {
        if (!open && btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect();
            setDropPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
        }
        setOpen(o => !o);
    };

    return (
        <div className="relative">
            <button
                ref={btnRef}
                onClick={handleToggle}
                className="flex items-center gap-2 h-9 rounded-md border border-gray-200 dark:border-gray-600 px-3 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 bg-white dark:bg-gray-800"
            >
                {label}: <span className="text-gray-900 dark:text-gray-200">{value}</span>
                <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {open && createPortal(
                <div
                    style={{ position: 'fixed', top: dropPos.top, right: dropPos.right, zIndex: 9999 }}
                    className="min-w-[140px] rounded-md bg-white dark:bg-gray-800 py-1 shadow-lg ring-1 ring-black/5 dark:ring-gray-700"
                >
                    {options.map(o => (
                        <button key={o} onClick={() => { onChange(o); setOpen(false); }}
                            className={cn("block w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700",
                                value === o ? "text-primary font-medium" : "text-gray-700 dark:text-gray-300")}>
                            {o}
                        </button>
                    ))}
                </div>,
                document.body
            )}
        </div>
    );
}

function SelectDropdown({ label, items, value, onChange }: {
    label: string;
    items: { value: string; label: string }[];
    value: string;
    onChange: (v: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [dropPos, setDropPos] = useState({ top: 0, right: 0 });
    const btnRef = useRef<HTMLButtonElement>(null);
    const current = items.find(i => i.value === value);

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => {
            if (!btnRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);

    const handleToggle = () => {
        if (!open && btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect();
            setDropPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
        }
        setOpen(o => !o);
    };

    return (
        <div className="relative">
            <button
                ref={btnRef}
                onClick={handleToggle}
                className="flex items-center gap-2 h-9 rounded-md border border-gray-200 dark:border-gray-600 px-3 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 bg-white dark:bg-gray-800"
            >
                {label}: <span className="text-gray-900 dark:text-gray-200">{current?.label ?? label}</span>
                <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {open && createPortal(
                <div
                    style={{ position: 'fixed', top: dropPos.top, right: dropPos.right, zIndex: 9999 }}
                    className="min-w-[160px] max-h-48 overflow-y-auto rounded-md bg-white dark:bg-gray-800 py-1 shadow-lg ring-1 ring-black/5 dark:ring-gray-700"
                >
                    {items.map(item => (
                        <button key={item.value} onClick={() => { onChange(item.value); setOpen(false); }}
                            className={cn("block w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700",
                                value === item.value ? "text-primary font-medium" : "text-gray-700 dark:text-gray-300")}>
                            {item.label}
                        </button>
                    ))}
                </div>,
                document.body
            )}
        </div>
    );
}

interface InventoryTableProps {
    data: InventoryItem[];
    initialFilter?: string;
    buildings?: { id: number; code: string; name: string }[];
    onEdit?: (item: InventoryItem) => void;
    onAdd?: () => void;
}

export function InventoryTable({ data, initialFilter = "", buildings = [], onEdit, onAdd }: InventoryTableProps) {
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState(initialFilter);
    const [statusFilter, setStatusFilter] = useState<"All" | "Online" | "Offline">("All");
    const [selectedBuilding, setSelectedBuilding] = useState("all");
    const [page, setPage] = useState(1);

    const filteredData = useMemo(() => {
        setPage(1);
        return data.filter((item) => {
            const matchesSearch =
                item.tenant.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.unit.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.meterSerial.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesFilter = statusFilter === "All" || item.status === statusFilter;
            const matchesBuilding = selectedBuilding === "all" || item.buildingId === Number(selectedBuilding);
            return matchesSearch && matchesFilter && matchesBuilding;
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, searchQuery, statusFilter, selectedBuilding]);

    const totalPages = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE));
    const pageData = filteredData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const start = filteredData.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
    const end = Math.min(page * PAGE_SIZE, filteredData.length);

    return (
        <div className="rounded-lg bg-white dark:bg-gray-900 shadow-sm ring-1 ring-gray-900/5 dark:ring-gray-700">
            <div className="border-b border-gray-200 dark:border-gray-700 px-3 sm:px-6 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{data.length} devices</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative flex-1 sm:flex-none">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400 dark:text-gray-500" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search unit, tenant, serial..."
                                className="h-9 w-full sm:w-52 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 pl-9 pr-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-gray-400 dark:placeholder:text-gray-500"
                            />
                        </div>
                                        {buildings.length > 0 && (
                            <SelectDropdown
                                label="Building"
                                items={[
                                    { value: "all", label: "All" },
                                    ...buildings.map(b => ({ value: String(b.id), label: b.name }))
                                ]}
                                value={selectedBuilding}
                                onChange={setSelectedBuilding}
                            />
                        )}
                        <FilterDropdown
                            label="Status"
                            options={["All", "Online", "Offline"]}
                            value={statusFilter}
                            onChange={(v) => setStatusFilter(v as "All" | "Online" | "Offline")}
                        />
                        {onAdd && (
                            <button
                                onClick={onAdd}
                                className="flex items-center gap-1.5 h-9 rounded-md bg-primary px-3 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
                            >
                                <Plus className="h-4 w-4" />
                                <span className="hidden sm:inline">Add Unit</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-500 dark:text-gray-400">
                    <thead className="bg-gray-50 dark:bg-gray-800 text-xs uppercase text-gray-700 dark:text-gray-300">
                        <tr>
                            <th className="hidden sm:table-cell px-3 sm:px-6 py-3 font-medium">Building</th>
                            <th className="px-3 sm:px-6 py-3 font-medium">Unit</th>
                            <th className="px-3 sm:px-6 py-3 font-medium">Tenant</th>
                            <th className="hidden md:table-cell px-3 sm:px-6 py-3 font-medium">Device ID</th>
                            <th className="px-3 sm:px-6 py-3 font-medium">Status</th>
                            <th className="hidden sm:table-cell px-3 sm:px-6 py-3 font-medium">Utilities</th>
                            <th className="px-3 sm:px-6 py-3 font-medium text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {pageData.length > 0 ? (
                            pageData.map((item) => (
                                <tr
                                    key={item.id}
                                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                                    onClick={() => navigate(`/devices/${item.id}`)}
                                >
                                    <td className="hidden sm:table-cell px-3 sm:px-6 py-3">
                                        <div className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[120px]">{item.buildingName || '-'}</div>
                                    </td>
                                    <td className="px-3 sm:px-6 py-3">
                                        <div className="font-medium text-gray-900 dark:text-gray-100">{item.unit}</div>
                                    </td>
                                    <td className="px-3 sm:px-6 py-3">
                                        <div className="text-sm text-gray-600 dark:text-gray-300 truncate max-w-[140px]">{item.tenant}</div>
                                    </td>
                                    <td className="hidden md:table-cell px-3 sm:px-6 py-3 font-mono text-xs">{item.meterSerial}</td>
                                    <td className="px-3 sm:px-6 py-3">
                                        <span className={cn(
                                            "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset",
                                            item.status === "Online"
                                                ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 ring-green-600/20"
                                                : "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 ring-red-600/20"
                                        )}>
                                            {item.status}
                                        </span>
                                    </td>
                                    <td className="hidden sm:table-cell px-3 sm:px-6 py-3">
                                        <div className="flex space-x-2">
                                            <span
                                                title={item.power ? "Power ON" : "Power OFF"}
                                                className={cn("flex h-8 w-8 items-center justify-center rounded-md border",
                                                    item.power
                                                        ? "border-primary bg-primary/10 text-primary"
                                                        : "border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-400"
                                                )}
                                            >
                                                <Power className="h-4 w-4" />
                                            </span>
                                            <span
                                                title={item.water ? "Water ON" : "Water OFF"}
                                                className={cn("flex h-8 w-8 items-center justify-center rounded-md border",
                                                    item.water
                                                        ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400"
                                                        : "border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-400"
                                                )}
                                            >
                                                <Droplets className="h-4 w-4" />
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-3 sm:px-6 py-3 text-right">
                                        {onEdit && (
                                            <button
                                                className="rounded-md border border-blue-200 dark:border-blue-800 px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                                onClick={(e) => { e.stopPropagation(); onEdit(item); }}
                                                title="Edit unit"
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={7} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
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
                        className="flex items-center rounded-md border border-gray-200 dark:border-gray-600 px-3 py-1 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft className="h-4 w-4 mr-1" /> Prev
                    </button>
                    <span className="text-sm text-gray-500 dark:text-gray-400">{page} / {totalPages}</span>
                    <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="flex items-center rounded-md border border-gray-200 dark:border-gray-600 px-3 py-1 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Next <ChevronRight className="h-4 w-4 ml-1" />
                    </button>
                </div>
            </div>
        </div>
    );
}
