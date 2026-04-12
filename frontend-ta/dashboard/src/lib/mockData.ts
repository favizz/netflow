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

// No hardcoded demo data — all data comes from the backend API via /unit
export const initialData: InventoryItem[] = [];
