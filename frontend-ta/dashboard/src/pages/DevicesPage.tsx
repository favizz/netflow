import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { InventoryTable } from "@/components/inventory/InventoryTable";
import { AddDeviceModal } from "@/components/inventory/AddDeviceModal";
import { EditUnitModal } from "@/components/inventory/EditUnitModal";
import type { InventoryItem } from "@/lib/mockData";
import { fetchApi } from "@/lib/api";
import { subscribeLiveTelemetry } from "@/lib/mockTelemetry";

type BuildingResponse = { id: number; code: string; name: string };
type UnitResponse = {
    id: number;
    building_id: number;
    token_electricity: string | number;
    token_water: string | number;
    resident_email: string | null;
    unit_no: string;
    device_id: string;
    relay_status: number;
    valve_status: number;
};
type ConnectivityResponse = { units: { online: boolean; deviceId: string }[] };

export default function DevicesPage() {
    const [searchParams] = useSearchParams();
    const initialFilter = searchParams.get("unit") ?? "";

    const [data, setData] = useState<InventoryItem[]>([]);
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<InventoryItem | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [buildings, setBuildings] = useState<BuildingResponse[]>([]);

    const loadData = useCallback(() => {
        setIsLoading(true);
        Promise.all([
            fetchApi('/admin/buildings').then((value) => value as BuildingResponse[]).catch(() => []),
            fetchApi('/unit').then((value) => value as UnitResponse[]),
            fetchApi('/unit/connectivity').then((value) => value as ConnectivityResponse).catch(() => ({ units: [] }))
        ])
            .then(([bldgs, units, conn]) => {
                setBuildings(bldgs || []);
                const bldgMap = new Map((bldgs || []).map((b) => [b.id, b.name]));
                const onlineIds = new Set(
                    (conn.units || []).filter(u => u.online).map(u => u.deviceId)
                );
                const mapped: InventoryItem[] = units.map((u) => ({
                    id: String(u.id),
                    buildingId: u.building_id,
                    buildingName: bldgMap.get(u.building_id) || "Unknown Building",
                    tenant: u.resident_email || "Unassigned",
                    unit: u.unit_no,
                    meterSerial: u.device_id,
                    balance: Number(u.token_electricity),
                    token_electricity: Number(u.token_electricity),
                    token_water: Number(u.token_water),
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

    // Live connectivity: flip any device row to Online as soon as telemetry arrives
    const deviceIds = useMemo(() => data.map(item => item.meterSerial), [data]);

    useEffect(() => {
        const unsubs = deviceIds.map(deviceId => subscribeLiveTelemetry(deviceId, (point) => {
            setData(prev => {
                const idx = prev.findIndex(item => item.meterSerial === deviceId);
                if (idx === -1) return prev;
                const cur = prev[idx];
                const updated: InventoryItem = {
                    ...cur,
                    status: "Online",
                    lastUpdate: "Live",
                    power: point.relayOn,
                    water: point.valveOn,
                };
                if (
                    cur.status === updated.status &&
                    cur.power === updated.power &&
                    cur.water === updated.water
                ) return prev;
                const next = [...prev];
                next[idx] = updated;
                return next;
            });
        }, 5000));
        return () => { unsubs.forEach(unsub => unsub()); };
    }, [deviceIds]);

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
                    onEdit={(item) => setEditTarget(item)}
                />
            )}

            <AddDeviceModal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} onSuccess={loadData} />
            <EditUnitModal unit={editTarget} onClose={() => setEditTarget(null)} onSuccess={loadData} />
        </div>
    );
}
