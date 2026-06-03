import { useState, useEffect, useRef, useCallback } from "react";
import { X, Check, Loader2, Search, ChevronDown } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { useToast } from "@/components/layout/ToastProvider";

interface AddDeviceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

interface Building { id: number; code: string; name: string }
interface Resident  { email: string; name: string }

function SearchDropdown<T>({
    label,
    required,
    placeholder,
    items,
    selected,
    onSelect,
    getLabel,
    getSub,
    loading,
}: {
    label: string;
    required?: boolean;
    placeholder: string;
    items: T[];
    selected: T | null;
    onSelect: (item: T | null) => void;
    getLabel: (item: T) => string;
    getSub?: (item: T) => string;
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

    const filtered = items.filter(item => {
        const q = query.toLowerCase();
        return getLabel(item).toLowerCase().includes(q) || (getSub ? getSub(item).toLowerCase().includes(q) : false);
    });

    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {label} {required && <span className="text-red-500">*</span>}
            </label>
            <div ref={wrapRef} className="relative">
                {selected ? (
                    <div className="flex items-center justify-between rounded-md border border-primary bg-primary/5 dark:bg-primary/10 px-3 py-2">
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-primary truncate">{getLabel(selected)}</p>
                            {getSub && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{getSub(selected)}</p>}
                        </div>
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
                                    filtered.map((item, i) => (
                                        <button
                                            key={i}
                                            type="button"
                                            onMouseDown={e => { e.preventDefault(); onSelect(item); setQuery(''); setOpen(false); }}
                                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100"
                                        >
                                            <span className="font-medium">{getLabel(item)}</span>
                                            {getSub && <span className="ml-1.5 text-xs text-gray-400">{getSub(item)}</span>}
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

export function AddDeviceModal({ isOpen, onClose, onSuccess }: AddDeviceModalProps) {
    const [buildings, setBuildings]   = useState<Building[]>([]);
    const [residents, setResidents]   = useState<Resident[]>([]);
    const [loadingData, setLoadingData] = useState(false);

    const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
    const [selectedResident, setSelectedResident] = useState<Resident | null>(null);
    const [unitNo, setUnitNo]   = useState('');
    const [deviceId, setDeviceId] = useState('');
    const [tokenElec, setTokenElec] = useState('0');
    const [tokenWater, setTokenWater] = useState('0');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const formRef = useRef<HTMLFormElement>(null);
    const toast = useToast();

    useEffect(() => {
        if (!isOpen) return;
        setSelectedBuilding(null);
        setSelectedResident(null);
        setUnitNo('');
        setDeviceId('');
        setTokenElec('0');
        setTokenWater('0');
        setError(null);

        setLoadingData(true);
        Promise.all([
            fetchApi('/admin/buildings').catch(() => []),
            fetchApi('/admin/residents').catch(() => []),
        ]).then(([bldgs, ress]) => {
            setBuildings(bldgs || []);
            setResidents(ress || []);
        }).finally(() => setLoadingData(false));
    }, [isOpen]);

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!selectedBuilding) { setError('Select a building.'); return; }
        if (!unitNo.trim())    { setError('Unit number is required.'); return; }
        if (!deviceId.trim())  { setError('Device ID is required.'); return; }
        if (!selectedResident) { setError('Assign the unit to a user.'); return; }

        setLoading(true);
        try {
            const unit = await fetchApi('/unit', {
                method: 'POST',
                body: JSON.stringify({
                    building_id: selectedBuilding.id,
                    unit_no: unitNo.trim().toUpperCase(),
                    device_id: deviceId.trim().toUpperCase(),
                    token_electricity: parseFloat(tokenElec) || 0,
                    token_water: parseFloat(tokenWater) || 0,
                }),
            });
            await fetchApi(`/admin/residents/${encodeURIComponent(selectedResident.email)}/units/${unit.id}`, {
                method: 'POST',
            });
            toast.success(`Unit ${unitNo.trim().toUpperCase()} added successfully.`);
            onSuccess();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message.replace(/^API error \(\d+\): /, '') : 'Failed to add unit');
        } finally {
            setLoading(false);
        }
    }, [selectedBuilding, selectedResident, unitNo, deviceId, tokenElec, tokenWater, toast, onSuccess, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg rounded-lg bg-white dark:bg-gray-800 shadow-xl ring-1 ring-gray-900/5 dark:ring-gray-700 flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 p-4 shrink-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Add Unit</h3>
                    <button onClick={onClose} className="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form ref={formRef} onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
                    {error && (
                        <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                            {error}
                        </div>
                    )}

                    <SearchDropdown<Building>
                        label="Building"
                        required
                        placeholder="Search building..."
                        items={buildings}
                        selected={selectedBuilding}
                        onSelect={setSelectedBuilding}
                        getLabel={b => b.name}
                        getSub={b => b.code}
                        loading={loadingData}
                    />

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Unit Number <span className="text-red-500">*</span>
                            </label>
                            <input
                                required
                                type="text"
                                value={unitNo}
                                onChange={e => setUnitNo(e.target.value)}
                                maxLength={20}
                                placeholder="e.g. A-101"
                                className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Device ID <span className="text-red-500">*</span>
                            </label>
                            <input
                                required
                                type="text"
                                value={deviceId}
                                onChange={e => setDeviceId(e.target.value)}
                                maxLength={100}
                                placeholder="e.g. DEV-A101"
                                className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Electricity Token (kWh)
                            </label>
                            <input
                                type="text"
                                inputMode="decimal"
                                value={tokenElec}
                                onChange={e => setTokenElec(e.target.value.replace(/[^0-9.]/g, ''))}
                                className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Water Token (m³)
                            </label>
                            <input
                                type="text"
                                inputMode="decimal"
                                value={tokenWater}
                                onChange={e => setTokenWater(e.target.value.replace(/[^0-9.]/g, ''))}
                                className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                        </div>
                    </div>

                    <SearchDropdown<Resident>
                        label="Assign To"
                        required
                        placeholder="Search user by name or email..."
                        items={residents}
                        selected={selectedResident}
                        onSelect={setSelectedResident}
                        getLabel={r => r.name || r.email}
                        getSub={r => r.name ? r.email : ''}
                        loading={loadingData}
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">Unit must be assigned to a user (admin or resident).</p>
                </form>

                <div className="border-t border-gray-100 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900/50 flex justify-end gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={loading}
                        className="rounded-md border border-gray-200 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => formRef.current?.requestSubmit()}
                        disabled={loading}
                        className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-60"
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        <span>Add Unit</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
