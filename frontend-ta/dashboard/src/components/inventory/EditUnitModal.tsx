import { useState, useEffect } from "react";
import { X, Check, Loader2 } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { useToast } from "@/components/layout/ToastProvider";
import { InventoryItem } from "@/lib/mockData";

interface EditUnitModalProps {
    unit: InventoryItem | null;
    onClose: () => void;
    onSuccess: () => void;
}

export function EditUnitModal({ unit, onClose, onSuccess }: EditUnitModalProps) {
    const [deviceId, setDeviceId] = useState("");
    const [balance, setBalance] = useState("0");
    const [buildingId, setBuildingId] = useState<number | "">("");
    
    const [buildings, setBuildings] = useState<{id: number, name: string}[]>([]);
    const [loadingBuildings, setLoadingBuildings] = useState(false);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const toast = useToast();

    useEffect(() => {
        if (unit) {
            setDeviceId(unit.meterSerial);
            setBalance(String(unit.balance || 0));
            setBuildingId(unit.buildingId || "");
            setError(null);
            
            // Fetch buildings list
            setLoadingBuildings(true);
            fetchApi('/admin/buildings')
                .then(data => setBuildings(data || []))
                .catch(() => setBuildings([]))
                .finally(() => setLoadingBuildings(false));
        }
    }, [unit]);

    if (!unit) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            await fetchApi(`/unit/${unit.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ 
                    device_id: deviceId.trim().toUpperCase(),
                    balance: parseFloat(balance),
                    building_id: buildingId ? Number(buildingId) : undefined
                }),
            });
            toast.success(`Unit ${unit.unit} updated successfully.`);
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
                        <p className="text-sm text-gray-500">{unit.unit}</p>
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
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Building</label>
                        {loadingBuildings ? (
                            <div className="flex items-center text-sm text-gray-500 mt-2"><Loader2 className="w-4 h-4 mr-2 animate-spin"/> Loading buildings...</div>
                        ) : (
                            <select 
                                value={buildingId} 
                                onChange={(e) => setBuildingId(Number(e.target.value))}
                                className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                                <option value="">-- Keep current / Unknown --</option>
                                {buildings.map(b => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                            </select>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Device ID / MAC</label>
                        <input
                            required
                            type="text"
                            value={deviceId}
                            onChange={(e) => setDeviceId(e.target.value)}
                            maxLength={100}
                            className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Balance (Rp)</label>
                        <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={balance}
                            onChange={(e) => setBalance(e.target.value.replace(/[^0-9]/g, ""))}
                            className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>

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
