import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { InventoryTable } from "@/components/inventory/InventoryTable";
import { AddDeviceModal } from "@/components/inventory/AddDeviceModal";
import { EditUnitModal } from "@/components/inventory/EditUnitModal";
import type { InventoryItem } from "@/lib/mockData";
import { fetchApi } from "@/lib/api";
import { useToast } from "@/components/layout/ToastProvider";

export default function DevicesPage() {
    const [searchParams] = useSearchParams();
    const initialFilter = searchParams.get("unit") ?? "";
    const toast = useToast();

    const [data, setData] = useState<InventoryItem[]>([]);
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<InventoryItem | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [buildings, setBuildings] = useState<{id: number, code: string, name: string}[]>([]);
    const [selectedBuilding, setSelectedBuilding] = useState<string>("all");
    const [deleteConfirm, setDeleteConfirm] = useState<InventoryItem | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const loadData = useCallback(() => {
        setIsLoading(true);
        Promise.all([
            fetchApi('/admin/buildings').catch(() => []),
            fetchApi('/unit'),
            fetchApi('/unit/connectivity').catch(() => ({ units: [] }))
        ])
            .then(([bldgs, units, conn]) => {
                setBuildings(bldgs || []);
                const bldgMap = new Map((bldgs || []).map((b: any) => [b.id, b.name]));
                const onlineIds = new Set(
                    ((conn.units || []) as { online: boolean; deviceId: string }[]).filter(u => u.online).map(u => u.deviceId)
                );
                const mapped: InventoryItem[] = units.map((u: { id: number; building_id: number; balance: string | number; resident_email: string | null; unit_no: string; device_id: string; relay_status: number; valve_status: number }) => ({
                    id: String(u.id),
                    buildingId: u.building_id,
                    buildingName: bldgMap.get(u.building_id) || "Unknown Building",
                    tenant: u.resident_email || "Unassigned",
                    unit: u.unit_no,
                    meterSerial: u.device_id,
                    balance: Number(u.balance),
                    status: onlineIds.has(u.device_id) ? "Online" : "Offline",
                    power: !!u.relay_status,
                    water: !!u.valve_status,
                    lastUpdate: onlineIds.has(u.device_id) ? "Live" : "Offline",
                }));
                setData(mapped);
            })
            .catch(() => {})
            .finally(() => setIsLoading(false));
    }, []);

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 30_000);
        return () => clearInterval(interval);
    }, [loadData]);

    const handleCommand = async (deviceId: string, type: 'relay' | 'valve', value: 0 | 1) => {
        await fetchApi(`/admin/command/${deviceId}`, {
            method: 'POST',
            body: JSON.stringify({ type, value }),
        });
        toast.success(`Command sent to ${type} on device ${deviceId}`);
        loadData();
    };

    const handleDelete = async () => {
        if (!deleteConfirm) return;
        setDeleteLoading(true);
        setDeleteError(null);
        try {
            await fetchApi(`/unit/${deleteConfirm.id}`, { method: 'DELETE' });
            toast.success(`Unit ${deleteConfirm.unit} deleted successfully.`);
            setDeleteConfirm(null);
            loadData();
        } catch (err) {
            setDeleteError(err instanceof Error ? err.message.replace(/^API error \(\d+\): /, '') : "Failed to delete unit");
        } finally {
            setDeleteLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Devices</h1>
                </div>
                <div className="flex items-center space-x-4">
                    <select
                        value={selectedBuilding}
                        onChange={(e) => setSelectedBuilding(e.target.value)}
                        className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                        <option value="all">All Buildings</option>
                        {buildings.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>
                    <button
                        onClick={() => setIsAddOpen(true)}
                        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary/90 transition-colors"
                    >
                        Register Unit
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="rounded-lg bg-white dark:bg-gray-800 p-8 text-center text-sm text-gray-400 dark:text-gray-500 shadow-sm ring-1 ring-gray-900/5 dark:ring-gray-700">
                    Loading devices...
                </div>
            ) : (
                <InventoryTable
                    data={selectedBuilding === "all" ? data : data.filter(d => d.buildingId === Number(selectedBuilding))}
                    initialFilter={initialFilter}
                    onEdit={(item) => setEditTarget(item)}
                    onDelete={(item) => setDeleteConfirm(item)}
                    onCommand={handleCommand}
                />
            )}

            <AddDeviceModal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} onSuccess={loadData} />
            <EditUnitModal unit={editTarget} onClose={() => setEditTarget(null)} onSuccess={loadData} />

            {deleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="w-full max-w-sm rounded-lg bg-white dark:bg-gray-800 shadow-xl ring-1 ring-gray-900/5 dark:ring-gray-700 p-6">
                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Delete Unit</h3>
                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                            Permanently delete unit <strong>{deleteConfirm.unit}</strong> ({deleteConfirm.meterSerial})? This also removes all associated meter readings.
                        </p>
                        {deleteError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{deleteError}</p>}
                        <div className="mt-4 flex justify-end space-x-3">
                            <button
                                onClick={() => { setDeleteConfirm(null); setDeleteError(null); }}
                                disabled={deleteLoading}
                                className="rounded-md border border-gray-200 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={deleteLoading}
                                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                            >
                                {deleteLoading ? "Deleting..." : "Delete"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
