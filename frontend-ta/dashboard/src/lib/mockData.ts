export interface InventoryItem {
    id: string;
    buildingId?: number;
    buildingName?: string;
    tenant: string;
    unit: string;
    meterSerial: string;
    balance?: number;
    token_electricity?: number;
    token_water?: number;
    status: string;
    power: boolean;
    water: boolean;
    lastUpdate: string;
}

// No hardcoded demo data here - DevicesPage loads everything from the mock
// store via fetchApi('/unit'), matching how it worked against the real API.
export const initialData: InventoryItem[] = [];
