import { useState, useEffect, useCallback } from "react";
import { InventoryTable } from "@/components/inventory/InventoryTable";
import { AddDeviceModal } from "@/components/inventory/AddDeviceModal";
import { EditUnitModal } from "@/components/inventory/EditUnitModal";
import type { InventoryItem } from "@/lib/mockData";
import { fetchApi } from "@/lib/api";
import { Loader2 } from "lucide-react";

export default function InventoryPage() {
    const [data, setData] = useState<InventoryItem[]>([]);
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<InventoryItem | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<InventoryItem | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const loadData = useCallback(() => {
        setIsLoading(true);
        Promise.all([
            fetchApi('/unit'),
            fetchApi('/unit/connectivity').catch(() => ({ onlineUnitsList: [], offlineUnitsList: [] }))
        ])
            .then(([units, conn]) => {
                const onlineIds = new Set((conn.onlineUnitsList || []).map((u: { device_id: string }) => u.device_id));
                const mapped: InventoryItem[] = units.map((u: { id: number; resident_email: string | null; unit_no: string; device_id: string; relay_status: number; valve_status: number }) => ({
                    id: String(u.id),
                    tenant: u.resident_email || "Unassigned",
                    unit: u.unit_no,
                    meterSerial: u.device_id,
                    status: onlineIds.has(u.device_id) ? "Online" : "Offline",
                    power: !!u.relay_status,
                    water: !!u.valve_status,
                    lastUpdate: onlineIds.has(u.device_id) ? "Live Data" : "Unknown",
                }));
                setData(mapped);
            })
            .catch(() => {})
            .finally(() => setIsLoading(false));
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const handleDelete = async () => {
        if (!deleteConfirm) return;
        setDeleteLoading(true);
        setDeleteError(null);
        try {
            await fetchApi(`/unit/${deleteConfirm.id}`, { method: 'DELETE' });
            setDeleteConfirm(null);
            loadData();
        } catch (err) {
            setDeleteError(err instanceof Error ? err.message.replace(/^API error \(\d+\): /, '') : 'Could not delete unit. Please try again.');
        } finally {
            setDeleteLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Asset Inventory</h1>
                </div>
                <button
                    onClick={() => setIsAddOpen(true)}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary/90"
                >
                    Add Unit
                </button>
            </div>

            {isLoading ? (
                <div className="rounded-lg bg-white dark:bg-gray-800 p-8 text-center text-sm text-gray-400 dark:text-gray-500 shadow-sm ring-1 ring-gray-900/5 dark:ring-gray-700">
                    Loading...
                </div>
            ) : (
                <InventoryTable data={data} onEdit={setEditTarget} onDelete={setDeleteConfirm} />
            )}

            <AddDeviceModal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} onSuccess={loadData} />
            <EditUnitModal unit={editTarget} onClose={() => setEditTarget(null)} onSuccess={loadData} />

            {deleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="w-full max-w-sm rounded-lg bg-white dark:bg-gray-800 shadow-xl ring-1 ring-gray-900/5 dark:ring-gray-700 p-6">
                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Delete Unit</h3>
                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                            Permanently delete <strong className="text-gray-700 dark:text-gray-300">{deleteConfirm.unit}</strong>? This removes all associated meter readings.
                        </p>
                        {deleteError && (
                            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{deleteError}</p>
                        )}
                        <div className="mt-5 flex justify-end gap-3">
                            <button onClick={() => { setDeleteConfirm(null); setDeleteError(null); }} disabled={deleteLoading}
                                className="rounded-md border border-gray-200 dark:border-gray-600 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
                                Cancel
                            </button>
                            <button onClick={handleDelete} disabled={deleteLoading}
                                className="flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">
                                {deleteLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
