import { useState } from "react";
import { InventoryTable } from "@/components/inventory/InventoryTable";
import { AddDeviceModal } from "@/components/inventory/AddDeviceModal";
import { initialData, InventoryItem } from "@/lib/mockData";

export default function InventoryPage() {
    const [data, setData] = useState<InventoryItem[]>(initialData);
    const [isModalOpen, setIsModalOpen] = useState(false);

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
