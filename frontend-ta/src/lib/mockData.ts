export interface InventoryItem {
    id: string;
    tenant: string;
    unit: string;
    meterSerial: string;
    status: string;
    power: boolean;
    water: boolean;
    lastUpdate: string;
}

export const initialData: InventoryItem[] = [
    { id: "101", tenant: "Sarah Chen", unit: "A-1204", meterSerial: "SM-882190", status: "Online", power: true, water: true, lastUpdate: "2 mins ago" },
    { id: "102", tenant: "Michael Ross", unit: "B-0805", meterSerial: "SM-992101", status: "Online", power: true, water: true, lastUpdate: "1 min ago" },
    { id: "103", tenant: "James Wilson", unit: "A-0302", meterSerial: "SM-772810", status: "Offline", power: false, water: true, lastUpdate: "1 hour ago" },
    { id: "104", tenant: "Emily Davis", unit: "C-1501", meterSerial: "SM-332910", status: "Online", power: true, water: false, lastUpdate: "5 mins ago" },
    { id: "105", tenant: "Robert Brown", unit: "B-0902", meterSerial: "SM-112340", status: "Online", power: true, water: true, lastUpdate: "Just now" },
];
