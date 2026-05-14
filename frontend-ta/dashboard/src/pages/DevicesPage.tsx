import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { InventoryTable } from "@/components/inventory/InventoryTable";
import { AddDeviceModal } from "@/components/inventory/AddDeviceModal";
import type { InventoryItem } from "@/lib/mockData";
import { fetchApi } from "@/lib/api";

export default function DevicesPage() {
    const [searchParams] = useSearchParams();
    const initialFilter = searchParams.get("unit") ?? "";

    const [data, setData] = useState<InventoryItem[]>([]);
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [buildings, setBuildings] = useState<{id: number, code: string, name: string}[]>([]);

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

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Devices</h1>

            {isLoading ? (
                <div className="rounded-lg bg-white dark:bg-gray-800 p-8 text-center text-sm text-gray-400 dark:text-gray-500 shadow-sm ring-1 ring-gray-900/5 dark:ring-gray-700">
                    Loading devices...
                </div>
            ) : (
                <InventoryTable
                    data={data}
                    initialFilter={initialFilter}
                    buildings={buildings}
                    onAdd={() => setIsAddOpen(true)}
                />
            )}

            <AddDeviceModal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} onSuccess={loadData} />
        </div>
    );
}
