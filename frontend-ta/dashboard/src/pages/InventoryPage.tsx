import { useState, useEffect } from "react";
import { InventoryTable } from "@/components/inventory/InventoryTable";
import { AddDeviceModal } from "@/components/inventory/AddDeviceModal";
import type { InventoryItem } from "@/lib/mockData";
import { fetchApi } from "@/lib/api";

export default function InventoryPage() {
    const [data, setData] = useState<InventoryItem[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            fetchApi('/unit'),
            fetchApi('/unit/connectivity').catch(() => ({ onlineUnitsList: [], offlineUnitsList: [] }))
        ])
            .then(([units, conn]) => {
                const onlineIds = new Set((conn.onlineUnitsList || []).map((u: any) => u.device_id));
                
                const mapped: InventoryItem[] = units.map((u: any) => {
                    const isOnline = onlineIds.has(u.device_id);
                    return {
                        id: String(u.id),
                        tenant: u.resident_email || "Unassigned",
                        unit: u.unit_no,
                        meterSerial: u.device_id,
                        status: isOnline ? "Online" : "Offline", 
                        power: !!u.relay_status,
                        water: !!u.valve_status,
                        lastUpdate: isOnline ? "Live Data" : "Unknown"
                    };
                });
                setData(mapped);
            })
            .catch(console.error)
            .finally(() => setIsLoading(false));
    }, []);

    const handleAddDevice = (device: InventoryItem) => {
        setData((prev) => [device, ...prev]);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Asset Inventory</h1>
                    <p className="mt-1 text-sm text-gray-500">Manage smart meters and tenant units.</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary/90"
                >
                    Add Device
                </button>
            </div>

            <InventoryTable data={data} />

            <AddDeviceModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onAdd={handleAddDevice}
            />
        </div>
    );
}
