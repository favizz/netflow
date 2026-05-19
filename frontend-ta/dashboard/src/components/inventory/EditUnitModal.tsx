import { useState, useEffect, useRef } from "react";
import { X, Check, Loader2, Search, ChevronDown } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { useToast } from "@/components/layout/ToastProvider";
import { InventoryItem } from "@/lib/mockData";

interface Building { id: number; name: string }

function SearchDropdown({ label, placeholder, items, selected, onSelect, loading }: {
    label: string;
    placeholder: string;
    items: Building[];
    selected: Building | null;
    onSelect: (item: Building | null) => void;
    loading?: boolean;
}) {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const filtered = items.filter(item =>
        item.name.toLowerCase().includes(query.toLowerCase())
    );

    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
            <div ref={wrapRef} className="relative">
                {selected ? (
                    <div className="flex items-center justify-between rounded-md border border-primary bg-primary/5 dark:bg-primary/10 px-3 py-2">
                        <p className="text-sm font-medium text-primary truncate">{selected.name}</p>
                        <button type="button" onClick={() => { onSelect(null); setQuery(''); }}
                            className="ml-2 shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                ) : (
                    <div>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
                            <input
                                type="text"
                                value={query}
                                onFocus={() => setOpen(true)}
                                onChange={e => { setQuery(e.target.value); setOpen(true); }}
                                placeholder={loading ? 'Loading...' : placeholder}
                                disabled={loading}
                                className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 pl-9 pr-8 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                            />
                            <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
                        </div>
                        {open && (
                            <div className="absolute z-[100] mt-1 w-full max-h-48 overflow-auto rounded-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 shadow-lg">
                                {filtered.length === 0 ? (
                                    <p className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">No results</p>
                                ) : (
                                    filtered.map((item) => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onMouseDown={e => { e.preventDefault(); onSelect(item); setQuery(''); setOpen(false); }}
                                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-medium"
                                        >
                                            {item.name}
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

interface EditUnitModalProps {
    unit: InventoryItem | null;
    onClose: () => void;
    onSuccess: () => void;
}

export function EditUnitModal({ unit, onClose, onSuccess }: EditUnitModalProps) {
    const [unitNo, setUnitNo] = useState("");
    const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);

    const [buildings, setBuildings] = useState<Building[]>([]);
    const [loadingBuildings, setLoadingBuildings] = useState(false);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const toast = useToast();

    useEffect(() => {
        if (unit) {
            setUnitNo(unit.unit);
            setError(null);

            setLoadingBuildings(true);
            fetchApi('/admin/buildings')
                .then((data: Building[]) => {
                    setBuildings(data || []);
                    const current = (data || []).find((b: Building) => b.id === unit.buildingId);
                    setSelectedBuilding(current ?? null);
                })
                .catch(() => setBuildings([]))
                .finally(() => setLoadingBuildings(false));
        }
    }, [unit]);

    if (!unit) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!unitNo.trim()) { setError("Unit number is required."); return; }
        setError(null);
        setLoading(true);
        try {
            await fetchApi(`/unit/${unit.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    unit_no: unitNo.trim(),
                    building_id: selectedBuilding ? selectedBuilding.id : undefined,
                }),
            });
            toast.success(`Unit updated successfully.`);
            onSuccess();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update unit");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-lg bg-white dark:bg-gray-800 shadow-xl ring-1 ring-gray-900/5 dark:ring-gray-700">
                <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 p-4">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Edit Unit</h3>
                        <p className="text-sm text-gray-500 font-mono">{unit.meterSerial}</p>
                    </div>
                    <button onClick={onClose} className="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {error && (
                        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Unit Number</label>
                        <input
                            required
                            type="text"
                            value={unitNo}
                            onChange={(e) => setUnitNo(e.target.value)}
                            placeholder="e.g. A-101"
                            maxLength={50}
                            className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>

                    <SearchDropdown
                        label="Building"
                        placeholder="Search building..."
                        items={buildings}
                        selected={selectedBuilding}
                        onSelect={setSelectedBuilding}
                        loading={loadingBuildings}
                    />

                    <div className="pt-2 flex justify-end space-x-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-md border border-gray-200 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex items-center space-x-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-60"
                        >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            <span>{loading ? "Saving..." : "Save Changes"}</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
