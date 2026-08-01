// Mock API router for the fully static demo build. Every page in this app
// calls fetchApi(endpoint, options) exactly as it did against the real
// backend; this file now resolves those calls against the in-browser
// mockDb store instead of making a network request. The function signature
// and the `API error (${status}): ${body}` throw format are preserved
// because several pages parse that string back apart (see BuildingsPage's
// friendlyError, for example).

import {
    MockApiError,
    listBuildings, createBuilding, updateBuilding, deleteBuilding,
    listUnits, getUnitById, createUnit, updateUnit, deleteUnit, getConnectivity,
    listResidents, createResident, deleteResident, assignUnit, unassignUnit, updateAccess,
    listTariffs, createTariff,
    getSettings, updateSettings,
    listActiveAnomaliesForUnit,
    listTransactions,
    listAuditLogs,
    sendUnitCommand, broadcastCommand, broadcastPushConfig, broadcastOta,
    getTrends,
} from './mockDb';

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function parseBody(options: RequestInit): Record<string, unknown> | undefined {
    if (!options.body || typeof options.body !== 'string') return undefined;
    try {
        const parsed = JSON.parse(options.body);
        return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : undefined;
    } catch {
        return undefined;
    }
}

export async function fetchApi(endpoint: string, options: RequestInit = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const [path, query] = endpoint.split('?');
    const body = parseBody(options);
    const params = new URLSearchParams(query || '');

    // Small artificial latency so loading states are visible, like a real API.
    await delay(180 + Math.random() * 220);

    try {
        return routeRequest(method, path, body, params);
    } catch (err) {
        if (err instanceof MockApiError) {
            throw new Error(`API error (${err.status}): ${err.body}`);
        }
        const message = err instanceof Error ? err.message : 'Unknown error';
        throw new Error(`API error (500): ${JSON.stringify({ message })}`);
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function routeRequest(method: string, path: string, body: Record<string, unknown> | undefined, params: URLSearchParams): any {
    let m: RegExpMatchArray | null;

    // ── Units ───────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/unit') return listUnits();
    if (method === 'POST' && path === '/unit') {
        return createUnit({
            building_id: Number(body?.building_id),
            unit_no: String(body?.unit_no ?? ''),
            device_id: String(body?.device_id ?? ''),
            token_electricity: body?.token_electricity !== undefined ? Number(body.token_electricity) : undefined,
            token_water: body?.token_water !== undefined ? Number(body.token_water) : undefined,
        });
    }
    if (method === 'GET' && path === '/unit/connectivity') return getConnectivity();
    if ((m = path.match(/^\/unit\/(\d+)$/))) {
        const id = Number(m[1]);
        if (method === 'GET') {
            const unit = getUnitById(id);
            if (!unit) throw new MockApiError(404, JSON.stringify({ message: 'Unit not found' }));
            return unit;
        }
        if (method === 'PATCH') {
            return updateUnit(id, {
                unit_no: body?.unit_no !== undefined ? String(body.unit_no) : undefined,
                building_id: body?.building_id !== undefined ? Number(body.building_id) : undefined,
                token_electricity: body?.token_electricity !== undefined ? Number(body.token_electricity) : undefined,
                token_water: body?.token_water !== undefined ? Number(body.token_water) : undefined,
            });
        }
        if (method === 'DELETE') { deleteUnit(id); return null; }
    }

    // ── Buildings ───────────────────────────────────────────────────────
    if (method === 'GET' && path === '/admin/buildings') return listBuildings();
    if (method === 'POST' && path === '/admin/buildings') {
        return createBuilding({
            code: String(body?.code ?? ''),
            name: String(body?.name ?? ''),
            address: body?.address !== undefined ? String(body.address) : undefined,
            floors: body?.floors !== undefined ? Number(body.floors) : undefined,
        });
    }
    if ((m = path.match(/^\/admin\/buildings\/(\d+)$/))) {
        const id = Number(m[1]);
        if (method === 'PATCH') {
            return updateBuilding(id, {
                code: body?.code !== undefined ? String(body.code) : undefined,
                name: body?.name !== undefined ? String(body.name) : undefined,
                address: body?.address !== undefined ? String(body.address) : undefined,
                floors: body?.floors !== undefined ? Number(body.floors) : undefined,
            });
        }
        if (method === 'DELETE') { deleteBuilding(id); return null; }
    }

    // ── Residents / users ──────────────────────────────────────────────
    if (method === 'GET' && path === '/admin/residents') return listResidents();
    if (method === 'POST' && path === '/admin/residents') {
        return createResident({
            email: String(body?.email ?? ''),
            name: body?.name !== undefined ? String(body.name) : undefined,
        });
    }
    if ((m = path.match(/^\/admin\/residents\/([^/]+)\/units\/(\d+)$/))) {
        const email = decodeURIComponent(m[1]);
        const unitId = Number(m[2]);
        if (method === 'POST') { assignUnit(email, unitId); return null; }
        if (method === 'DELETE') { unassignUnit(email, unitId); return null; }
    }
    if ((m = path.match(/^\/admin\/residents\/([^/]+)$/)) && method === 'DELETE') {
        deleteResident(decodeURIComponent(m[1]));
        return null;
    }
    if ((m = path.match(/^\/admin\/accounts\/([^/]+)\/access$/)) && method === 'PATCH') {
        const email = decodeURIComponent(m[1]);
        const role = body?.role === 'admin' || body?.isAdmin === true ? 'admin' : 'resident';
        return updateAccess(email, role);
    }

    // ── Tariffs ─────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/admin/tariff') return listTariffs();
    if (method === 'POST' && path === '/admin/tariff') {
        return createTariff({
            utility_type: body?.utility_type === 'water' ? 'water' : 'electricity',
            price_per_unit: Number(body?.price_per_unit ?? 0),
            effective_date: String(body?.effective_date ?? new Date().toISOString().split('T')[0]),
        });
    }

    // ── Calibration settings ───────────────────────────────────────────
    if (method === 'GET' && path === '/admin/settings') return getSettings();
    if (method === 'PATCH' && path === '/admin/settings') {
        return updateSettings({
            CAL_FACTOR_FLOWRATE: body?.CAL_FACTOR_FLOWRATE !== undefined ? Number(body.CAL_FACTOR_FLOWRATE) : undefined,
            CAL_FACTOR_POWER: body?.CAL_FACTOR_POWER !== undefined ? Number(body.CAL_FACTOR_POWER) : undefined,
            SENSOR_SAMPLING_TIME: body?.SENSOR_SAMPLING_TIME !== undefined ? Number(body.SENSOR_SAMPLING_TIME) : undefined,
        });
    }

    // ── Transactions / audit logs / anomalies ─────────────────────────
    if (method === 'GET' && path === '/admin/transactions') return listTransactions();
    if (method === 'GET' && path === '/admin/audit-logs') return listAuditLogs();
    if ((m = path.match(/^\/admin\/anomalies\/([^/]+)$/)) && method === 'GET') {
        return listActiveAnomaliesForUnit(decodeURIComponent(m[1]));
    }

    // ── Device commands ────────────────────────────────────────────────
    if ((m = path.match(/^\/admin\/command\/([^/]+)$/)) && method === 'POST') {
        const deviceId = decodeURIComponent(m[1]);
        const type = body?.type === 'valve' ? 'valve' : 'relay';
        const value: 0 | 1 = Number(body?.value) === 1 ? 1 : 0;
        sendUnitCommand(deviceId, type, value);
        return { status: 'queued' };
    }
    if (method === 'POST' && path === '/admin/command') {
        const type = body?.type === 'valve' ? 'valve' : 'relay';
        const value: 0 | 1 = Number(body?.value) === 1 ? 1 : 0;
        return { pushed: broadcastCommand(type, value) };
    }
    if (method === 'POST' && path === '/admin/push-config') {
        return { pushed: broadcastPushConfig() };
    }
    if (method === 'POST' && path === '/admin/ota') {
        const version = String(body?.version ?? '1.0.0');
        return { pushed: broadcastOta(version) };
    }

    // ── Reporting trends ────────────────────────────────────────────────
    if ((m = path.match(/^\/reporting\/trends\/([^/]+)$/)) && method === 'GET') {
        const unitNo = decodeURIComponent(m[1]);
        const period = params.get('period') === 'monthly' ? 'monthly' : 'daily';
        return getTrends(unitNo, period);
    }

    throw new MockApiError(404, JSON.stringify({ message: `Not found: ${method} ${path}` }));
}
