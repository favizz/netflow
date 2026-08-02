// In-browser mock "database" for the fully static demo build of the dashboard.
// Everything that used to hit the real backend now reads/writes this in-memory
// store, which is persisted to localStorage so state survives page reloads.

import { publishAck } from './mockBroker';

const STORAGE_KEY = 'netflow_demo_store_v1';

export class MockApiError extends Error {
    status: number;
    body: string;
    constructor(status: number, body: string) {
        super(`API error (${status}): ${body}`);
        this.status = status;
        this.body = body;
    }
}

// ── Types ────────────────────────────────────────────────────────────────

export interface Building {
    id: number;
    code: string;
    name: string;
    address: string | null;
    floors: number;
    created_at: string;
}

export interface Unit {
    id: number;
    unit_no: string;
    device_id: string;
    building_id: number;
    resident_email: string | null;
    token_electricity: number;
    token_water: number;
    relay_status: 0 | 1;
    valve_status: 0 | 1;
    last_energy_reading: number;
    last_water_reading: number;
    created_at: string;
}

export interface Resident {
    email: string;
    name: string | null;
    picture: string | null;
    role: 'resident' | 'admin';
    created_at: string;
}

export interface Tariff {
    id: number;
    utility_type: 'electricity' | 'water';
    price_per_unit: number;
    effective_date: string;
}

export interface Anomaly {
    id: number;
    unit_no: string;
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    detectedAt: string;
    resolved_at: string | null;
}

export interface Transaction {
    id: string;
    unitNo: string;
    method: 'qris' | 'transfer' | 'ewallet';
    amount: number;
    status: 'success' | 'pending' | 'failed';
    createdAt: string;
    gateway_reference: string;
}

export interface AuditLog {
    id: number;
    created_at: string;
    actor: string;
    action: string;
    target_type: string;
    target: string | null;
    details: string | null;
    result: 'success' | 'failure' | 'info';
}

export interface CalibrationConfig {
    CAL_FACTOR_FLOWRATE: number;
    CAL_FACTOR_POWER: number;
    SENSOR_SAMPLING_TIME: number;
}

interface Store {
    buildings: Building[];
    units: Unit[];
    residents: Resident[];
    tariffs: Tariff[];
    anomalies: Anomaly[];
    transactions: Transaction[];
    auditLogs: AuditLog[];
    calibration: CalibrationConfig;
    connectivity: Record<string, boolean>;
    seq: { building: number; unit: number; auditLog: number; tariff: number; anomaly: number };
}

// ── Small deterministic PRNG helpers (also used by mockTelemetry) ─────────

export function hashString(str: string): number {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return h >>> 0;
}

export function mulberry32(seed: number): () => number {
    let a = seed;
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function daysAgo(n: number, hourOffset = 9): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(hourOffset, Math.floor(Math.random() * 59), 0, 0);
    return d.toISOString();
}

// ── Seed data ───────────────────────────────────────────────────────────

const RESIDENT_NAMES: { email: string; name: string }[] = [
    { email: 'michael.johnson@example.com', name: 'Michael Johnson' },
    { email: 'emily.davis@example.com', name: 'Emily Davis' },
    { email: 'robert.brown@example.com', name: 'Robert Brown' },
    { email: 'linda.wilson@example.com', name: 'Linda Wilson' },
    { email: 'william.miller@example.com', name: 'William Miller' },
    { email: 'barbara.moore@example.com', name: 'Barbara Moore' },
    { email: 'james.taylor@example.com', name: 'James Taylor' },
    { email: 'patricia.anderson@example.com', name: 'Patricia Anderson' },
    { email: 'david.thomas@example.com', name: 'David Thomas' },
    { email: 'susan.jackson@example.com', name: 'Susan Jackson' },
    { email: 'richard.white@example.com', name: 'Richard White' },
    { email: 'jennifer.harris@example.com', name: 'Jennifer Harris' },
    { email: 'charles.martin@example.com', name: 'Charles Martin' },
];

function seedStore(): Store {
    const buildings: Building[] = [
        { id: 1, code: 'TOWER-A', name: 'Tower A', address: '12 Riverside Avenue, Springfield', floors: 3, created_at: daysAgo(400) },
        { id: 2, code: 'TOWER-B', name: 'Tower B', address: '14 Riverside Avenue, Springfield', floors: 3, created_at: daysAgo(390) },
        { id: 3, code: 'TOWER-C', name: 'Tower C', address: '16 Riverside Avenue, Springfield', floors: 2, created_at: daysAgo(380) },
    ];

    // unit_no -> [building_id, resident_email|null, token_electricity, token_water, relay, valve]
    const unitDefs: [string, number, string | null, number, number, 0 | 1, 0 | 1][] = [
        ['A-101', 1, 'resident@netflow.demo', 45.5, 12.3, 1, 1],
        ['A-102', 1, 'michael.johnson@example.com', 78.2, 18.6, 1, 1],
        ['A-103', 1, 'emily.davis@example.com', 3.2, 9.4, 1, 1],
        ['A-201', 1, 'robert.brown@example.com', 62.0, 15.1, 1, 1],
        ['A-202', 1, 'linda.wilson@example.com', 110.4, 24.7, 1, 1],
        ['A-203', 1, 'william.miller@example.com', 33.8, 7.9, 1, 1],
        ['A-301', 1, 'barbara.moore@example.com', 95.6, 21.2, 1, 1],
        ['A-302', 1, null, 55.0, 14.0, 1, 1],
        ['B-101', 2, 'james.taylor@example.com', 28.9, 6.5, 1, 1],
        ['B-102', 2, 'patricia.anderson@example.com', 133.1, 29.3, 1, 1],
        ['B-201', 2, 'resident@netflow.demo', 68.7, 16.8, 1, 1],
        ['B-202', 2, 'david.thomas@example.com', 40.0, 10.0, 0, 0],
        ['B-301', 2, 'susan.jackson@example.com', 85.3, 19.5, 1, 1],
        ['C-101', 3, 'richard.white@example.com', 51.2, 11.4, 1, 1],
        ['C-102', 3, 'jennifer.harris@example.com', 22.6, 5.2, 1, 1],
        ['C-201', 3, 'charles.martin@example.com', 147.9, 30.0, 1, 1],
        ['C-202', 3, null, 60.0, 13.0, 1, 1],
    ];

    const units: Unit[] = unitDefs.map(([unit_no, building_id, resident_email, token_electricity, token_water, relay_status, valve_status], idx) => ({
        id: idx + 1,
        unit_no,
        device_id: `DEV-${unit_no}`,
        building_id,
        resident_email,
        token_electricity,
        token_water,
        relay_status,
        valve_status,
        last_energy_reading: Math.round((200 + Math.random() * 2000) * 10) / 10,
        last_water_reading: Math.round((10 + Math.random() * 150) * 10) / 10,
        created_at: daysAgo(350 - idx * 3),
    }));

    const residents: Resident[] = [
        { email: 'admin@netflow.demo', name: 'John Doe', picture: null, role: 'admin', created_at: daysAgo(400) },
        { email: 'supervisor@netflow.demo', name: 'Alex Morgan', picture: null, role: 'admin', created_at: daysAgo(395) },
        { email: 'resident@netflow.demo', name: 'Jane Doe', picture: null, role: 'resident', created_at: daysAgo(300) },
        ...RESIDENT_NAMES.map((r, i) => ({ email: r.email, name: r.name, picture: null, role: 'resident' as const, created_at: daysAgo(280 - i * 5) })),
    ];

    const tariffs: Tariff[] = [
        { id: 1, utility_type: 'electricity', price_per_unit: 1500, effective_date: '2025-01-01' },
        { id: 2, utility_type: 'water', price_per_unit: 5500, effective_date: '2025-01-01' },
    ];

    const anomalyDefs: [string, string, Anomaly['severity'], string, number, boolean][] = [
        ['A-103', 'jailbreak', 'critical', 'Jailbreak attempt detected on device DEV-A-103: invalid firmware signature.', 2, false],
        ['A-302', 'water_leak', 'high', 'Water leak detected on unit A-302: continuous flow for more than 6 hours without stopping.', 1, false],
        ['B-202', 'device_offline', 'medium', 'Device B-202 has not responded in the last 45 minutes.', 0, false],
        ['A-103', 'mcb_trip', 'high', 'MCB trip on unit A-103: power reached 1380 W (limit 1300 W).', 5, true],
        ['A-103', 'low_electricity_token', 'high', 'Electricity token running low: 3.20 kWh remaining. Top up soon.', 0, false],
        ['C-102', 'low_water_token', 'medium', 'Water token running low: 1.50 m³ remaining. Top up soon.', 3, false],
        ['B-301', 'voltage_anomaly', 'medium', 'Unstable voltage detected on unit B-301: 245.3 V (outside the normal range of 210-230V).', 7, true],
        ['C-101', 'sensor_malfunction', 'low', 'Current sensor on unit C-101 is malfunctioning: inconsistent readings.', 12, true],
        ['A-201', 'low_power_factor', 'low', 'Low power factor detected on unit A-201: 0.62 (below the 0.85 threshold).', 9, true],
        ['B-101', 'usage_spike', 'medium', 'Electricity usage spike detected on unit B-101: 3.2x the daily average.', 4, false],
        ['C-202', 'zero_flow', 'medium', 'Zero water flow detected on unit C-202 for more than 24 hours despite an available token balance.', 6, false],
        ['A-202', 'backflow', 'high', 'Backflow detected on unit A-202: possible faulty valve.', 15, true],
        ['A-301', 'usage_spike', 'low', 'Water usage spike detected on unit A-301: 2.1x the daily average.', 18, true],
        ['B-102', 'voltage_anomaly', 'low', 'Voltage briefly dropped to 208.4 V on unit B-102 for 3 minutes.', 22, true],
        ['C-201', 'low_water_token', 'low', 'Water token for unit C-201 is below threshold: 4.8 m³.', 10, false],
        ['A-102', 'sensor_malfunction', 'low', 'Flow rate sensor on unit A-102 briefly reported an out-of-range value.', 25, true],
    ];

    const anomalies: Anomaly[] = anomalyDefs.map(([unit_no, type, severity, message, daysBack, resolved], idx) => ({
        id: idx + 1,
        unit_no,
        type,
        severity,
        message,
        detectedAt: daysAgo(daysBack, 6 + Math.floor(Math.random() * 16)),
        resolved_at: resolved ? daysAgo(Math.max(0, daysBack - 1)) : null,
    }));

    const txDefs: [string, string, Transaction['method'], number, Transaction['status'], number][] = [
        ['A-101', 'A-101', 'qris', 50000, 'success', 1],
        ['A-102', 'A-102', 'ewallet', 100000, 'success', 3],
        ['A-103', 'A-103', 'transfer', 75000, 'success', 4],
        ['A-201', 'A-201', 'qris', 150000, 'success', 6],
        ['A-202', 'A-202', 'qris', 200000, 'success', 8],
        ['A-203', 'A-203', 'ewallet', 40000, 'pending', 0],
        ['A-301', 'A-301', 'transfer', 120000, 'success', 11],
        ['B-101', 'B-101', 'qris', 30000, 'success', 13],
        ['B-102', 'B-102', 'ewallet', 180000, 'success', 15],
        ['B-201', 'B-201', 'qris', 60000, 'success', 18],
        ['B-301', 'B-301', 'transfer', 95000, 'success', 21],
        ['C-101', 'C-101', 'qris', 55000, 'success', 25],
        ['C-102', 'C-102', 'ewallet', 20000, 'pending', 2],
        ['C-201', 'C-201', 'transfer', 200000, 'success', 30],
        ['A-101', 'A-101', 'qris', 65000, 'success', 45],
    ];

    const transactions: Transaction[] = txDefs.map(([, unitNo, method, amount, status, daysBack], idx) => ({
        id: `TRX-${String(idx + 1).padStart(3, '0')}`,
        unitNo,
        method,
        amount,
        status,
        createdAt: daysAgo(daysBack, 10 + Math.floor(Math.random() * 10)),
        gateway_reference: `PG-${100000 + idx}`,
    }));

    const auditDefs: [string, string, string | null, string | null, string | null, AuditLog['result'], number][] = [
        ['admin@netflow.demo', 'LOGIN', null, null, JSON.stringify({ ip: '10.0.0.4' }), 'success', 30],
        ['admin@netflow.demo', 'CREATE_UNIT', 'unit', '1', JSON.stringify({ unit_no: 'A-101' }), 'success', 29],
        ['admin@netflow.demo', 'ASSIGN_UNIT', 'unit', '1', JSON.stringify({ email: 'resident@netflow.demo' }), 'success', 29],
        ['supervisor@netflow.demo', 'UPDATE_TARIFF', 'tariff', '1', JSON.stringify({ price_per_unit: 1500 }), 'success', 27],
        ['admin@netflow.demo', 'UPDATE_SETTINGS', 'settings', null, JSON.stringify({ CAL_FACTOR_FLOWRATE: 4.55 }), 'success', 25],
        ['admin@netflow.demo', 'PUSH_CONFIG', 'broadcast', 'config', JSON.stringify({ count: 17 }), 'success', 25],
        ['admin@netflow.demo', 'SEND_COMMAND', 'broadcast', 'relay', JSON.stringify({ type: 'relay', value: 1, count: 17 }), 'success', 22],
        ['supervisor@netflow.demo', 'CREATE_RESIDENT', 'resident', 'michael.johnson@example.com', JSON.stringify({ name: 'Michael Johnson' }), 'success', 20],
        ['admin@netflow.demo', 'ANOMALY', 'unit', 'A-103', JSON.stringify({ type: 'low_electricity_token' }), 'failure', 18],
        ['admin@netflow.demo', 'UPDATE_UNIT', 'unit', '3', JSON.stringify({ token_electricity: 3.2 }), 'success', 17],
        ['admin@netflow.demo', 'OTA_PUSH', 'broadcast', '1.2.0', JSON.stringify({ version: '1.2.0' }), 'success', 15],
        ['admin@netflow.demo', 'OTA_ACK', 'unit', 'DEV-A-101', JSON.stringify({ status: 'ok' }), 'success', 15],
        ['supervisor@netflow.demo', 'UPDATE_BUILDING', 'building', '2', JSON.stringify({ floors: 3 }), 'success', 14],
        ['admin@netflow.demo', 'DELETE_RESIDENT', 'resident', 'old.tenant@example.com', null, 'success', 12],
        ['admin@netflow.demo', 'ANOMALY', 'unit', 'A-302', JSON.stringify({ type: 'water_leak' }), 'failure', 10],
        ['admin@netflow.demo', 'ASSIGN_UNIT', 'unit', '11', JSON.stringify({ email: 'resident@netflow.demo' }), 'success', 9],
        ['admin@netflow.demo', 'SEND_COMMAND', 'unit', 'DEV-B-202', JSON.stringify({ type: 'relay', value: 0 }), 'success', 8],
        ['admin@netflow.demo', 'CLIENT_ERROR', null, null, JSON.stringify({ message: 'ResizeObserver loop limit exceeded' }), 'info', 7],
        ['supervisor@netflow.demo', 'UPDATE_ACCESS', 'resident', 'supervisor@netflow.demo', JSON.stringify({ role: 'admin' }), 'success', 6],
        ['admin@netflow.demo', 'CREATE_TARIFF', 'tariff', '2', JSON.stringify({ utility_type: 'water', price_per_unit: 5500 }), 'success', 5],
        ['admin@netflow.demo', 'UNASSIGN_UNIT', 'unit', '16', JSON.stringify({ email: 'charles.martin@example.com' }), 'failure', 4],
        ['admin@netflow.demo', 'LOGIN', null, null, JSON.stringify({ ip: '10.0.0.4' }), 'success', 3],
        ['admin@netflow.demo', 'PUSH_CONFIG', 'broadcast', 'config', JSON.stringify({ count: 17 }), 'success', 2],
        ['admin@netflow.demo', 'SEND_COMMAND', 'broadcast', 'valve', JSON.stringify({ type: 'valve', value: 1, count: 17 }), 'success', 1],
        ['admin@netflow.demo', 'DELETE_UNIT', 'unit', '99', JSON.stringify({ unit_no: 'X-999' }), 'success', 1],
    ];

    const auditLogs: AuditLog[] = auditDefs
        .map(([actor, action, target_type, target, details, result, daysBack], idx) => ({
            id: idx + 1,
            created_at: daysAgo(daysBack, 8 + Math.floor(Math.random() * 12)),
            actor,
            action,
            target_type: target_type ?? '',
            target,
            details,
            result,
        }))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const connectivity: Record<string, boolean> = {};
    units.forEach(u => { connectivity[u.device_id] = u.device_id !== 'DEV-B-202'; });

    return {
        buildings,
        units,
        residents,
        tariffs,
        anomalies,
        transactions,
        auditLogs,
        calibration: { CAL_FACTOR_FLOWRATE: 4.55, CAL_FACTOR_POWER: 1.05, SENSOR_SAMPLING_TIME: 5 },
        connectivity,
        seq: {
            building: buildings.length + 1,
            unit: units.length + 1,
            auditLog: auditLogs.length + 1,
            tariff: tariffs.length + 1,
            anomaly: anomalies.length + 1,
        },
    };
}

// ── Store persistence ──────────────────────────────────────────────────

let _store: Store | null = null;

function loadStore(): Store {
    if (typeof window === 'undefined') return seedStore();
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as Store;
            if (parsed && Array.isArray(parsed.units) && Array.isArray(parsed.buildings)) {
                return parsed;
            }
        }
    } catch {
        /* corrupt storage, fall through to reseed */
    }
    const fresh = seedStore();
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh)); } catch { /* ignore quota errors */ }
    return fresh;
}

function db(): Store {
    if (!_store) _store = loadStore();
    return _store;
}

function persist(): void {
    if (!_store || typeof window === 'undefined') return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(_store)); } catch { /* ignore quota errors */ }
}

export function resetMockDb(): void {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    _store = null;
}

// ── Audit log helper ────────────────────────────────────────────────────

function addAuditLog(input: { action: string; target_type: string; target: string | null; details: string | null; result: AuditLog['result']; actor?: string }): void {
    const s = db();
    const entry: AuditLog = {
        id: s.seq.auditLog++,
        created_at: new Date().toISOString(),
        actor: input.actor ?? 'admin@netflow.demo',
        action: input.action,
        target_type: input.target_type,
        target: input.target,
        details: input.details,
        result: input.result,
    };
    s.auditLogs.unshift(entry);
    persist();
}

export function listAuditLogs() {
    return db().auditLogs.map(l => ({
        id: l.id,
        created_at: l.created_at,
        actor: l.actor,
        admin_email: l.actor,
        action: l.action,
        target_type: l.target_type,
        entity: l.target_type,
        target: l.target,
        entity_id: l.target,
        details: l.details,
        result: l.result,
    }));
}

// ── Buildings ───────────────────────────────────────────────────────────

export function listBuildings(): Building[] { return [...db().buildings]; }

export function createBuilding(input: { code: string; name: string; address?: string; floors?: number }): Building {
    const s = db();
    const b: Building = {
        id: s.seq.building++,
        code: input.code,
        name: input.name,
        address: input.address || null,
        floors: input.floors ?? 1,
        created_at: new Date().toISOString(),
    };
    s.buildings.push(b);
    persist();
    addAuditLog({ action: 'CREATE_BUILDING', target_type: 'building', target: String(b.id), details: JSON.stringify({ code: b.code, name: b.name }), result: 'success' });
    return b;
}

export function updateBuilding(id: number, input: Partial<{ code: string; name: string; address: string; floors: number }>): Building {
    const s = db();
    const b = s.buildings.find(x => x.id === id);
    if (!b) throw new MockApiError(404, JSON.stringify({ message: 'Building not found' }));
    if (input.code !== undefined) b.code = input.code;
    if (input.name !== undefined) b.name = input.name;
    if (input.address !== undefined) b.address = input.address;
    if (input.floors !== undefined) b.floors = input.floors;
    persist();
    addAuditLog({ action: 'UPDATE_BUILDING', target_type: 'building', target: String(id), details: JSON.stringify(input), result: 'success' });
    return b;
}

export function deleteBuilding(id: number): void {
    const s = db();
    const idx = s.buildings.findIndex(x => x.id === id);
    if (idx === -1) throw new MockApiError(404, JSON.stringify({ message: 'Building not found' }));
    const assignedCount = s.units.filter(u => u.building_id === id).length;
    if (assignedCount > 0) {
        addAuditLog({ action: 'DELETE_BUILDING', target_type: 'building', target: String(id), details: JSON.stringify({ assignedCount }), result: 'failure' });
        throw new MockApiError(409, JSON.stringify({ message: `Cannot delete building: ${assignedCount} unit(s) are still assigned to it.` }));
    }
    s.buildings.splice(idx, 1);
    persist();
    addAuditLog({ action: 'DELETE_BUILDING', target_type: 'building', target: String(id), details: null, result: 'success' });
}

// ── Units ───────────────────────────────────────────────────────────────

export function listUnits(): Unit[] { return [...db().units]; }
export function getUnitById(id: number): Unit | undefined { return db().units.find(u => u.id === id); }
export function getUnitByDeviceId(deviceId: string): Unit | undefined { return db().units.find(u => u.device_id === deviceId); }

export function createUnit(input: { building_id: number; unit_no: string; device_id: string; token_electricity?: number; token_water?: number }): Unit {
    const s = db();
    if (s.units.some(u => u.unit_no === input.unit_no)) {
        throw new MockApiError(409, JSON.stringify({ message: `Unit ${input.unit_no} already exists.` }));
    }
    if (s.units.some(u => u.device_id === input.device_id)) {
        throw new MockApiError(409, JSON.stringify({ message: `Device ID ${input.device_id} already exists.` }));
    }
    const unit: Unit = {
        id: s.seq.unit++,
        unit_no: input.unit_no,
        device_id: input.device_id,
        building_id: input.building_id,
        resident_email: null,
        token_electricity: input.token_electricity ?? 0,
        token_water: input.token_water ?? 0,
        relay_status: 1,
        valve_status: 1,
        last_energy_reading: 0,
        last_water_reading: 0,
        created_at: new Date().toISOString(),
    };
    s.units.push(unit);
    s.connectivity[unit.device_id] = true;
    persist();
    addAuditLog({ action: 'CREATE_UNIT', target_type: 'unit', target: String(unit.id), details: JSON.stringify({ unit_no: unit.unit_no }), result: 'success' });
    return unit;
}

export function updateUnit(id: number, input: Partial<{ unit_no: string; building_id: number; token_electricity: number; token_water: number }>): Unit {
    const s = db();
    const u = s.units.find(x => x.id === id);
    if (!u) throw new MockApiError(404, JSON.stringify({ message: 'Unit not found' }));
    if (input.unit_no !== undefined) u.unit_no = input.unit_no;
    if (input.building_id !== undefined) u.building_id = input.building_id;
    if (input.token_electricity !== undefined) u.token_electricity = input.token_electricity;
    if (input.token_water !== undefined) u.token_water = input.token_water;
    persist();
    addAuditLog({ action: 'UPDATE_UNIT', target_type: 'unit', target: String(id), details: JSON.stringify(input), result: 'success' });
    return u;
}

export function deleteUnit(id: number): void {
    const s = db();
    const idx = s.units.findIndex(x => x.id === id);
    if (idx === -1) throw new MockApiError(404, JSON.stringify({ message: 'Unit not found' }));
    const [removed] = s.units.splice(idx, 1);
    delete s.connectivity[removed.device_id];
    persist();
    addAuditLog({ action: 'DELETE_UNIT', target_type: 'unit', target: String(id), details: JSON.stringify({ unit_no: removed.unit_no }), result: 'success' });
}

export function getConnectivity() {
    const s = db();
    const units = s.units.map(u => ({ deviceId: u.device_id, online: !!s.connectivity[u.device_id] }));
    const onlineUnits = units.filter(u => u.online).length;
    return { units, onlineUnits, totalUnits: units.length };
}

export function isDeviceOnline(deviceId: string): boolean { return !!db().connectivity[deviceId]; }

// ── Residents ───────────────────────────────────────────────────────────

export function listResidents(): Resident[] { return [...db().residents]; }

export function createResident(input: { email: string; name?: string }): Resident {
    const s = db();
    if (!input.email) throw new MockApiError(400, JSON.stringify({ message: 'Email is required.' }));
    if (s.residents.some(r => r.email.toLowerCase() === input.email.toLowerCase())) {
        throw new MockApiError(409, JSON.stringify({ message: `A user with email ${input.email} already exists.` }));
    }
    const r: Resident = { email: input.email, name: input.name || null, picture: null, role: 'resident', created_at: new Date().toISOString() };
    s.residents.push(r);
    persist();
    addAuditLog({ action: 'CREATE_RESIDENT', target_type: 'resident', target: r.email, details: JSON.stringify({ name: r.name }), result: 'success' });
    return r;
}

export function deleteResident(email: string): void {
    const s = db();
    const idx = s.residents.findIndex(r => r.email === email);
    if (idx === -1) throw new MockApiError(404, JSON.stringify({ message: 'User not found' }));
    s.residents.splice(idx, 1);
    s.units.forEach(u => { if (u.resident_email === email) u.resident_email = null; });
    persist();
    addAuditLog({ action: 'DELETE_RESIDENT', target_type: 'resident', target: email, details: null, result: 'success' });
}

export function assignUnit(email: string, unitId: number): void {
    const s = db();
    const resident = s.residents.find(r => r.email === email);
    if (!resident) throw new MockApiError(404, JSON.stringify({ message: 'User not found' }));
    const unit = s.units.find(u => u.id === unitId);
    if (!unit) throw new MockApiError(404, JSON.stringify({ message: 'Unit not found' }));
    unit.resident_email = email;
    persist();
    addAuditLog({ action: 'ASSIGN_UNIT', target_type: 'unit', target: String(unitId), details: JSON.stringify({ email }), result: 'success' });
}

export function unassignUnit(email: string, unitId: number): void {
    const s = db();
    const unit = s.units.find(u => u.id === unitId);
    if (!unit) throw new MockApiError(404, JSON.stringify({ message: 'Unit not found' }));
    if (unit.resident_email === email) unit.resident_email = null;
    persist();
    addAuditLog({ action: 'UNASSIGN_UNIT', target_type: 'unit', target: String(unitId), details: JSON.stringify({ email }), result: 'success' });
}

export function updateAccess(email: string, role: 'admin' | 'resident'): Resident {
    const s = db();
    const r = s.residents.find(x => x.email === email);
    if (!r) throw new MockApiError(404, JSON.stringify({ message: 'User not found' }));
    r.role = role;
    persist();
    addAuditLog({ action: 'UPDATE_ACCESS', target_type: 'resident', target: email, details: JSON.stringify({ role }), result: 'success' });
    return r;
}

// ── Tariffs ─────────────────────────────────────────────────────────────

export function listTariffs(): Tariff[] { return [...db().tariffs]; }

export function createTariff(input: { utility_type: 'electricity' | 'water'; price_per_unit: number; effective_date: string }): Tariff {
    const s = db();
    const t: Tariff = { id: s.seq.tariff++, utility_type: input.utility_type, price_per_unit: input.price_per_unit, effective_date: input.effective_date };
    s.tariffs.push(t);
    persist();
    addAuditLog({ action: 'CREATE_TARIFF', target_type: 'tariff', target: String(t.id), details: JSON.stringify(input), result: 'success' });
    return t;
}

// ── Calibration settings ───────────────────────────────────────────────

export function getSettings(): CalibrationConfig { return { ...db().calibration }; }

export function updateSettings(input: Partial<CalibrationConfig>): CalibrationConfig {
    const s = db();
    if (input.CAL_FACTOR_FLOWRATE !== undefined) s.calibration.CAL_FACTOR_FLOWRATE = input.CAL_FACTOR_FLOWRATE;
    if (input.CAL_FACTOR_POWER !== undefined) s.calibration.CAL_FACTOR_POWER = input.CAL_FACTOR_POWER;
    if (input.SENSOR_SAMPLING_TIME !== undefined) s.calibration.SENSOR_SAMPLING_TIME = input.SENSOR_SAMPLING_TIME;
    persist();
    addAuditLog({ action: 'UPDATE_SETTINGS', target_type: 'settings', target: null, details: JSON.stringify(input), result: 'success' });
    return { ...s.calibration };
}

// ── Anomalies ───────────────────────────────────────────────────────────

export function listActiveAnomaliesForUnit(unitNo: string) {
    return db().anomalies
        .filter(a => a.unit_no === unitNo && a.resolved_at === null)
        .map(a => ({
            anomalyType: a.type,
            type: a.type,
            severity: a.severity,
            message: a.message,
            detectedAt: a.detectedAt,
            timestamp: a.detectedAt,
        }));
}

// ── Transactions ────────────────────────────────────────────────────────

export function listTransactions(): Transaction[] { return [...db().transactions]; }

// ── Reporting trends (synthetic, deterministic per unit) ──────────────

export function getTrends(unitNo: string, period: 'daily' | 'monthly'): { bucket: string; kwh: number; waterM3: number }[] {
    const rand = mulberry32(hashString(`${unitNo}:${period}`));
    const now = new Date();
    const rows: { bucket: string; kwh: number; waterM3: number }[] = [];

    if (period === 'daily') {
        const days = 420;
        for (let i = days; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const weekend = d.getDay() === 0 || d.getDay() === 6;
            const boost = weekend ? 1.15 : 1;
            rows.push({
                bucket: d.toISOString(),
                kwh: Number(((3 + rand() * 5) * boost).toFixed(2)),
                waterM3: Number(((0.08 + rand() * 0.35) * boost).toFixed(3)),
            });
        }
    } else {
        const months = 30;
        for (let i = months; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            rows.push({
                bucket: d.toISOString(),
                kwh: Number((90 + rand() * 160).toFixed(2)),
                waterM3: Number((3 + rand() * 10).toFixed(2)),
            });
        }
    }
    return rows;
}

// ── Device commands (simulated device acks via mockBroker) ────────────

export function sendUnitCommand(deviceId: string, type: 'relay' | 'valve', value: 0 | 1): void {
    const s = db();
    const unit = s.units.find(u => u.device_id === deviceId);
    if (!unit) throw new MockApiError(404, JSON.stringify({ message: 'Device not found' }));
    addAuditLog({ action: 'SEND_COMMAND', target_type: 'unit', target: String(unit.id), details: JSON.stringify({ type, value }), result: 'success' });
    const applyDelay = 900 + Math.random() * 900;
    setTimeout(() => {
        const unitNow = db().units.find(u => u.id === unit.id);
        if (!unitNow) return;
        if (type === 'relay') unitNow.relay_status = value; else unitNow.valve_status = value;
        persist();
    }, applyDelay);
}

export function broadcastCommand(type: 'relay' | 'valve', value: 0 | 1): string[] {
    const s = db();
    const deviceIds = s.units.map(u => u.device_id);
    addAuditLog({ action: 'SEND_COMMAND', target_type: 'broadcast', target: type, details: JSON.stringify({ type, value, count: deviceIds.length }), result: 'success' });
    deviceIds.forEach((id, i) => {
        const missAck = Math.random() < 0.08;
        if (missAck) return;
        const delay = 800 + i * 150 + Math.random() * 1500;
        setTimeout(() => {
            const unit = db().units.find(u => u.device_id === id);
            if (unit) {
                if (type === 'relay') unit.relay_status = value; else unit.valve_status = value;
                persist();
            }
            const noop = Math.random() < 0.05;
            publishAck(id, 'command_ack', { status: noop ? 'noop' : 'ok', type });
        }, delay);
    });
    return deviceIds;
}

export function broadcastPushConfig(): string[] {
    const s = db();
    const deviceIds = s.units.map(u => u.device_id);
    addAuditLog({ action: 'PUSH_CONFIG', target_type: 'broadcast', target: 'config', details: JSON.stringify(s.calibration), result: 'success' });
    deviceIds.forEach((id, i) => {
        const missAck = Math.random() < 0.05;
        if (missAck) return;
        const delay = 700 + i * 120 + Math.random() * 1200;
        setTimeout(() => publishAck(id, 'config_ack', { status: 'ok' }), delay);
    });
    return deviceIds;
}

export function broadcastOta(version: string): string[] {
    const s = db();
    const deviceIds = s.units.map(u => u.device_id);
    addAuditLog({ action: 'OTA_PUSH', target_type: 'broadcast', target: version, details: JSON.stringify({ version }), result: 'success' });
    deviceIds.forEach((id, i) => {
        const missAck = Math.random() < 0.1;
        if (missAck) return;
        const delay = 3000 + i * 400 + Math.random() * 4000;
        setTimeout(() => publishAck(id, 'ota_ack', { status: 'ok', version }), delay);
    });
    return deviceIds;
}
