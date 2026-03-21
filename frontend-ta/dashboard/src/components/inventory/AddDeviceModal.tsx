import { useState } from "react";
import { X, Check } from "lucide-react";
import { InventoryItem } from "@/lib/mockData";

interface AddDeviceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (device: InventoryItem) => void;
}

export function AddDeviceModal({ isOpen, onClose, onAdd }: AddDeviceModalProps) {
    const [formData, setFormData] = useState({
        tenant: "",
        unit: "",
        meterSerial: "",
    });

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onAdd({
            id: Math.random().toString(36).substr(2, 9),
            ...formData,
            status: "Online",
            power: true,
            water: true,
            lastUpdate: "Just now",
        });
        setFormData({ tenant: "", unit: "", meterSerial: "" }); // Reset
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-lg bg-white shadow-xl ring-1 ring-gray-900/5 animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between border-b border-gray-100 p-4">
                    <h3 className="text-lg font-semibold text-gray-900">Add New Device</h3>
                    <button onClick={onClose} className="rounded-full p-2 text-gray-900 hover:bg-gray-100">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Tenant Name</label>
                        <input
                            required
                            type="text"
                            value={formData.tenant}
                            onChange={(e) => setFormData({ ...formData, tenant: e.target.value })}
                            className="mt-1 block w-full rounded-md border text-gray-700 border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="e.g. John Doe"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Unit Number</label>
                        <input
                            required
                            type="text"
                            value={formData.unit}
                            onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                            className="mt-1 block w-full rounded-md border text-gray-700 border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="e.g. A-101"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Meter Serial Number</label>
                        <input
                            required
                            type="text"
                            value={formData.meterSerial}
                            onChange={(e) => setFormData({ ...formData, meterSerial: e.target.value })}
                            className="mt-1 block w-full rounded-md border text-gray-700 border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="e.g. SM-123456"
                        />
                    </div>

                    <div className="pt-2 flex justify-end space-x-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex items-center space-x-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
                        >
                            <Check className="h-4 w-4" />
                            <span>Add Device</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
