import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { SlidersHorizontal, Save, CheckCircle, AlertCircle, Zap, Droplets, Loader2, Clock, Pencil, Check, X, Terminal, Radio, UploadCloud, ExternalLink } from "lucide-react";
import { fetchApi } from "@/lib/api";
import mqtt from "mqtt";
import { MQTT_CONFIG, API_BASE_URL } from "@/lib/constants";

interface CalibrationConfig {
    CAL_FACTOR_FLOWRATE: number;
    CAL_FACTOR_POWER: number;
    SENSOR_SAMPLING_TIME: number;
}

interface Tariff {
    id: number;
    utility_type: 'electricity' | 'water';
    price_per_unit: number;
    effective_date: string;
}

const DEFAULTS: CalibrationConfig = {
    CAL_FACTOR_FLOWRATE: 4.55,
    CAL_FACTOR_POWER: 1.05,
    SENSOR_SAMPLING_TIME: 5,
};

function TariffCard({ icon, label, unit, tariff, pendingTariff, onSave }: {
    icon: React.ReactNode;
    label: string;
    unit: string;
    tariff: Tariff | null;
    pendingTariff?: Tariff | null;
    onSave: (price: number, date: string) => Promise<void>;
}) {
    const [editing, setEditing] = useState(false);
    const [price, setPrice] = useState('');
    const [date, setDate] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const startEdit = () => {
        setPrice(tariff ? String(tariff.price_per_unit) : '');
        // Always default to today — saving always creates a new entry, never patches.
        setDate(new Date().toISOString().split('T')[0]);
        setError(null);
        setEditing(true);
    };

    const handleSave = async () => {
        const p = parseFloat(price);
        if (!p || p <= 0) { setError('Enter a valid price.'); return; }
        if (!date) { setError('Enter a valid date.'); return; }
        setSaving(true);
        setError(null);
        try {
            await onSave(p, date);
            setEditing(false);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Could not save tariff.';
            setError(message.replace(/^API error \(\d+\): /, '') || 'Could not save tariff.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="rounded-lg border border-gray-200 dark:border-gray-600 p-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    {icon}
                    {label} <span className="text-gray-400 dark:text-gray-500 font-normal">({unit})</span>
                </div>
                {!editing && (
                    <button onClick={startEdit} className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-primary transition-colors">
                        <Pencil className="h-3.5 w-3.5" /> Change Rate
                    </button>
                )}
            </div>

            {!editing ? (
                tariff ? (
                    <div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                            Rp {Number(tariff.price_per_unit).toLocaleString('id-ID')}
                        </p>
                        <p className="mt-1 flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                            <Clock className="h-3 w-3" /> Effective from {tariff.effective_date}
                        </p>
                        {pendingTariff && (
                            <p className="mt-1.5 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                                <Clock className="h-3 w-3" />
                                Scheduled: Rp {Number(pendingTariff.price_per_unit).toLocaleString('id-ID')} from {pendingTariff.effective_date}
                            </p>
                        )}
                    </div>
                ) : (
                    <p className="text-sm text-gray-400 dark:text-gray-500">No tariff configured yet.</p>
                )
            ) : (
                <div className="space-y-2">
                    {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
                    <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Price per unit (Rp)</label>
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={price}
                            onChange={e => setPrice(e.target.value)}
                            className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="e.g. 1444.70"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Effective from</label>
                        <input
                            type="date"
                            value={date}
                            onChange={e => setDate(e.target.value)}
                            className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                        <button onClick={() => setEditing(false)} className="flex items-center gap-1 rounded-md border border-gray-200 dark:border-gray-600 px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                            <X className="h-3.5 w-3.5" /> Cancel
                        </button>
                        <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-60">
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            Save
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function InputField({ label, value, min, max, step, unit, serverValue, onChange, onValidityChange }: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    unit?: string;
    serverValue: number;
    onChange: (v: number) => void;
    onValidityChange?: (valid: boolean) => void;
}) {
    const [local, setLocal] = useState(String(value));
    useEffect(() => { setLocal(String(value)); }, [value]);

    const parsed = step < 1 ? parseFloat(local) : parseInt(local);
    const isInvalid = isNaN(parsed) || parsed < min || parsed > max;
    const isChanged = !isInvalid && parsed !== serverValue;

    useEffect(() => { onValidityChange?.(!isInvalid); }, [isInvalid, onValidityChange]);

    const handleBlur = () => {
        if (!isNaN(parsed)) onChange(parsed);
        else setLocal(String(value));
    };

    const borderClass = isInvalid
        ? 'border-red-400 dark:border-red-500 focus:border-red-400 focus:ring-red-400'
        : isChanged
        ? 'border-amber-400 dark:border-amber-400 focus:border-amber-400 focus:ring-amber-400'
        : 'border-gray-300 dark:border-gray-600 focus:border-primary focus:ring-primary';

    return (
        <div>
            <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
                <span className="text-xs text-gray-400 dark:text-gray-500">range: {min}–{max}{unit}</span>
            </div>
            <input
                type="number"
                step={step}
                value={local}
                onChange={e => setLocal(e.target.value)}
                onBlur={handleBlur}
                className={`block w-full rounded-md border px-3 py-1.5 text-sm font-mono bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 transition-colors ${borderClass}`}
            />
        </div>
    );
}

type LogEntry = {
    id: string;
    ts: string;
    level: 'info' | 'ok' | 'err' | 'pending';
    text: string;
    deviceId?: string;
    ackType?: string;
};

let _logSeq = 0;
function makeId() { return `${Date.now().toString(36)}-${(++_logSeq).toString(36)}`; }
function ts() { return new Date().toLocaleTimeString('id-ID', { hour12: false }); }

export default function ControlCenterPage() {
    // ── Calibration ───────────────────────────────────────────────────────────
    const [config, setConfig] = useState<CalibrationConfig>(DEFAULTS);
    const [serverConfig, setServerConfig] = useState<CalibrationConfig>(DEFAULTS);
    const [loadingConfig, setLoadingConfig] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [fieldValidity, setFieldValidity] = useState({ flowrate: true, power: true, sampling: true });
    const hasInvalidInput = !fieldValidity.flowrate || !fieldValidity.power || !fieldValidity.sampling;
    const onFlowrateValid = useCallback((v: boolean) => setFieldValidity(p => ({ ...p, flowrate: v })), []);
    const onPowerValid    = useCallback((v: boolean) => setFieldValidity(p => ({ ...p, power: v })),    []);
    const onSamplingValid = useCallback((v: boolean) => setFieldValidity(p => ({ ...p, sampling: v })), []);

    // ── Tariffs ───────────────────────────────────────────────────────────────
    const [elecTariff, setElecTariff] = useState<Tariff | null>(null);
    const [waterTariff, setWaterTariff] = useState<Tariff | null>(null);
    const [pendingElecTariff, setPendingElecTariff] = useState<Tariff | null>(null);
    const [pendingWaterTariff, setPendingWaterTariff] = useState<Tariff | null>(null);
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);

    // ── Broadcast commands state ──────────────────────────────────────────────
    const [cmdPending, setCmdPending] = useState<string | null>(null);
    const [log, setLog] = useState<LogEntry[]>([]);
    const [broadcastConfirm, setBroadcastConfirm] = useState<{ type: 'relay' | 'valve'; value: 0 | 1 } | null>(null);
    // Batch tracking: summaryId, counts, device→batchId mapping
    type BatchTracker = { summaryId: string; label: string; total: number; received: number; success: number; failure: number };
    const batchTrackersRef = useRef<Map<string, BatchTracker>>(new Map()); // batchId → tracker
    const deviceBatchRef   = useRef<Map<string, string>>(new Map());       // `${ackType}:${deviceId}` → batchId

    // ── OTA state ─────────────────────────────────────────────────────────────
    const [otaBinaryLink, setOtaBinaryLink] = useState('');
    const [otaVersion, setOtaVersion] = useState('');
    const [otaPending, setOtaPending] = useState(false);
    const [lastOtaLink, setLastOtaLink] = useState(() => localStorage.getItem('ota_last_link') ?? '');
    const [lastOtaVersion, setLastOtaVersion] = useState(() => localStorage.getItem('ota_last_version') ?? '');

    // ── Subscribe to ACKs from devices ──────────────────────────────────────
    useEffect(() => {
        if (!MQTT_CONFIG.brokerUrl) return;

        let active = true;
        const client = mqtt.connect(MQTT_CONFIG.brokerUrl, {
            ...MQTT_CONFIG.options,
            clientId: `dashboard-ctrl-${Math.random().toString(16).slice(2, 8)}`,
        });

        client.on('connect', () => {
            if (!active) return;
            client.subscribe('device/+/ota_ack');
            client.subscribe('device/+/config_ack');
            client.subscribe('device/+/command_ack');
            client.subscribe('device/+/status');
        });

        client.on('error', (err) => {
            if (active) console.error(`[MQTT] Connection error:`, err);
        });

        client.on('message', (topic, payload) => {
            if (!active) return;
            const parts = topic.split('/');
            const deviceId = parts[1] ?? 'unknown';
            const type = parts[2] ?? 'unknown';

            // ── LWT / device status ───────────────────────────────────────────
            if (type === 'status') {
                let online = true;
                try {
                    const s = payload.toString().trim();
                    if (s === 'offline' || s === '0') {
                        online = false;
                    } else {
                        const parsed = JSON.parse(s) as { online?: boolean | number };
                        online = parsed.online !== false && parsed.online !== 0;
                    }
                } catch { online = false; }

                if (!online) {
                    // Mark any pending ACK for this device as immediately failed
                    const ackTypes = ['command_ack', 'config_ack', 'ota_ack'];
                    ackTypes.forEach(ackType => {
                        const batchKey = `${ackType}:${deviceId}`;
                        const batchId = deviceBatchRef.current.get(batchKey);
                        if (!batchId) return;
                        deviceBatchRef.current.delete(batchKey);
                        const tracker = batchTrackersRef.current.get(batchId);
                        if (!tracker) return;
                        tracker.received++;
                        tracker.failure++;
                        setLog(prev => [...prev.slice(-49), {
                            id: makeId(), ts: ts(), level: 'err',
                            text: `✗ [${deviceId}] went offline — command not confirmed`,
                        }]);
                        if (tracker.received >= tracker.total) {
                            const allOk = tracker.failure === 0;
                            setLog(prev => prev.map(e => e.id === tracker.summaryId
                                ? { ...e, level: allOk ? 'ok' : 'err', ts: ts(),
                                    text: allOk
                                        ? `✓ ${tracker.label} — SUCCESS (${tracker.total}/${tracker.total})`
                                        : `✗ ${tracker.label} — FAILED (${tracker.success}/${tracker.total} ok, ${tracker.failure} failed)` }
                                : e));
                            batchTrackersRef.current.delete(batchId);
                        }
                    });
                }
                return;
            }

            interface MqttAck {
                status?: 'ok' | 'noop' | 'error' | 'failed' | 'unknown';
                version?: string;
                error?: string | number;
                type?: string;
            }

            let ack: MqttAck = {};
            try { ack = JSON.parse(payload.toString()); } catch { ack = { status: 'unknown' }; }

            // 'noop' = device already in requested state — counts as acceptable, not failure
            const level: LogEntry['level'] = ack.status === 'ok' ? 'ok' : ack.status === 'noop' ? 'info' : 'err';
            let text = '';

            if (type === 'ota_ack') {
                text = ack.status === 'ok'
                    ? `✓ OTA [${deviceId}] flash ok — v${ack.version ?? '?'}`
                    : ack.status === 'noop'
                    ? `· OTA [${deviceId}] already up-to-date`
                    : `✗ OTA [${deviceId}] failed — error ${ack.error ?? '?'}`;
            } else if (type === 'config_ack') {
                text = ack.status === 'ok'
                    ? `✓ CONFIG [${deviceId}] calibration applied`
                    : `✗ CONFIG [${deviceId}] failed — ${ack.error ?? '?'}`;
            } else if (type === 'command_ack') {
                text = ack.status === 'ok'
                    ? `✓ CMD [${deviceId}] ${ack.type ?? 'actuation'} ok`
                    : ack.status === 'noop'
                    ? `· CMD [${deviceId}] ${ack.type ?? 'actuation'} already in requested state`
                    : `✗ CMD [${deviceId}] ${ack.type ?? 'actuation'} failed`;
            } else {
                text = `? ACK [${deviceId}/${type}]: ${JSON.stringify(ack)}`;
            }

            // Write individual device ACK entry, then update batch summary
            const batchKey = `${type}:${deviceId}`;
            const batchId  = deviceBatchRef.current.get(batchKey);
            if (batchId) {
                deviceBatchRef.current.delete(batchKey);
                const tracker = batchTrackersRef.current.get(batchId);
                if (tracker && tracker.total <= 50) {
                    setLog(prev => [...prev.slice(-49), { id: makeId(), ts: ts(), level, text }]);
                }
                if (tracker) {
                    tracker.received++;
                    // 'ok' and 'noop' are both acceptable outcomes; only 'err' counts as failure
                    if (level === 'ok' || level === 'info') tracker.success++;
                    if (level === 'err') tracker.failure++;
                    if (tracker.received >= tracker.total) {
                        const allOk = tracker.failure === 0;
                        setLog(prev => prev.map(e => e.id === tracker.summaryId
                            ? { ...e, level: allOk ? 'ok' : 'err', ts: ts(),
                                text: allOk
                                    ? `✓ ${tracker.label} — SUCCESS (${tracker.total}/${tracker.total})`
                                    : `✗ ${tracker.label} — FAILED (${tracker.success}/${tracker.total} ok, ${tracker.failure} failed)` }
                            : e));
                        batchTrackersRef.current.delete(batchId);
                    }
                }
            } else {
                // ACK not from a tracked broadcast — just append
                setLog(prev => [...prev.slice(-49), { id: makeId(), ts: ts(), level, text }]);
            }
        });
        return () => {
            active = false;
            try { client.end(true); } catch { /* ignore close race */ }
        };
    }, []);

    const isDirty = useMemo(
        () => JSON.stringify(config) !== JSON.stringify(serverConfig),
        [config, serverConfig]
    );

    const addLog = useCallback((level: LogEntry['level'], text: string) =>
        setLog(prev => [...prev.slice(-49), { id: makeId(), ts: ts(), level, text }]), []);

    // Creates ONE summary pending entry for the whole broadcast, then logs each
    // individual device ACK as it arrives. Summary resolves to SUCCESS only when
    // ALL devices reply with ok; any failure or timeout → FAILED.
    const addPendingBatch = useCallback((
        devices: string[],
        ackType: string,
        summaryLabel: string,
        deviceLabelFn: (deviceId: string) => string,
        timeoutMs = 10_000,
    ) => {
        if (devices.length === 0) {
            setLog(prev => [...prev.slice(-49), { id: makeId(), ts: ts(), level: 'info', text: '· No devices with assigned hardware IDs' }]);
            return;
        }
        const batchId  = makeId();
        const summaryId = makeId();

        // One summary entry starts as pending
        setLog(prev => [...prev.slice(-49), {
            id: summaryId, ts: ts(), level: 'pending',
            text: `⏳ ${summaryLabel} — ${devices.length} device(s) [waiting for ACK...]`,
        }]);

        // Register tracker + device→batch mappings
        batchTrackersRef.current.set(batchId, { summaryId, label: summaryLabel, total: devices.length, received: 0, success: 0, failure: 0 });
        devices.forEach(d => deviceBatchRef.current.set(`${ackType}:${d}`, batchId));

        // Timeout: log any unreplied devices, resolve summary
        setTimeout(() => {
            const tracker = batchTrackersRef.current.get(batchId);
            if (!tracker) return;
            const remaining = devices.filter(d => deviceBatchRef.current.get(`${ackType}:${d}`) === batchId);
            if (tracker.total <= 50) {
                remaining.forEach(d => {
                    deviceBatchRef.current.delete(`${ackType}:${d}`);
                    tracker.received++;
                    tracker.failure++;
                    setLog(prev => [...prev.slice(-49), { id: makeId(), ts: ts(), level: 'err', text: `✗ ${deviceLabelFn(d)} — no response (timeout)` }]);
                });
            } else {
                remaining.forEach(d => {
                    deviceBatchRef.current.delete(`${ackType}:${d}`);
                    tracker.received++;
                    tracker.failure++;
                });
            }
            const allOk = tracker.failure === 0;
            setLog(prev => prev.map(e => e.id === summaryId
                ? { ...e, level: allOk ? 'ok' : 'err', ts: ts(),
                    text: allOk
                        ? `✓ ${summaryLabel} — SUCCESS (${tracker.total}/${tracker.total})`
                        : `✗ ${summaryLabel} — FAILED (${tracker.success}/${tracker.total} ok, ${tracker.failure} failed)` }
                : e));
            batchTrackersRef.current.delete(batchId);
        }, timeoutMs);
    }, []);

    const loadTariffs = useCallback(() => {
        fetchApi('/admin/tariff')
            .then((data: Tariff[]) => {
                if (!Array.isArray(data)) return;
                const today = new Date().toISOString().split('T')[0];
                // Active = most recent tariff with effective_date <= today (matches backend findCurrent logic)
                const active = (t: 'electricity' | 'water') =>
                    data
                        .filter(r => r.utility_type === t && r.effective_date <= today)
                        .sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0] ?? null;
                // Pending = soonest upcoming tariff with effective_date > today
                const pending = (t: 'electricity' | 'water') =>
                    data
                        .filter(r => r.utility_type === t && r.effective_date > today)
                        .sort((a, b) => a.effective_date.localeCompare(b.effective_date))[0] ?? null;
                setElecTariff(active('electricity'));
                setWaterTariff(active('water'));
                setPendingElecTariff(pending('electricity'));
                setPendingWaterTariff(pending('water'));
            })
            .catch((err: unknown) => addLog('err', `Failed to load tariffs: ${err instanceof Error ? err.message : 'Unknown error'}`));
    }, [addLog]);

    useEffect(() => {
        fetchApi('/admin/settings')
            .then((data: unknown) => {
                if (data && typeof data === 'object') {
                    const d = data as Record<string, unknown>;
                    const loaded: CalibrationConfig = {
                        CAL_FACTOR_FLOWRATE: Number(d.CAL_FACTOR_FLOWRATE ?? DEFAULTS.CAL_FACTOR_FLOWRATE),
                        CAL_FACTOR_POWER: Number(d.CAL_FACTOR_POWER ?? DEFAULTS.CAL_FACTOR_POWER),
                        SENSOR_SAMPLING_TIME: Number(d.SENSOR_SAMPLING_TIME ?? DEFAULTS.SENSOR_SAMPLING_TIME),
                    };
                    setConfig(loaded);
                    setServerConfig(loaded);
                }
            })
            .catch(() => {})
            .finally(() => setLoadingConfig(false));
        loadTariffs();
        setLastUpdated(new Date().toLocaleString('id-ID'));
    }, [loadTariffs]);

    const handleSave = async () => {
        setSaving(true);
        setSaveStatus('idle');
        try {
            await fetchApi('/admin/settings', { method: 'PATCH', body: JSON.stringify(config) });
            setServerConfig({ ...config });
            setSaveStatus('success');
            setLastUpdated(new Date().toLocaleString('id-ID'));
        } catch {
            setSaveStatus('error');
        } finally {
            setSaving(false);
            setTimeout(() => setSaveStatus('idle'), 3000);
        }
    };

    const sendCommandAll = async (type: 'relay' | 'valve', value: 0 | 1) => {
        const key = `${type}-${value}`;
        const label = `${type === 'relay' ? 'Relay' : 'Valve'} ${value ? 'ON/OPEN' : 'OFF/CLOSE'}`;
        setCmdPending(key);
        addLog('info', `→ BROADCAST ${label} → all devices`);
        try {
            const res = await fetchApi('/admin/command', {
                method: 'POST',
                body: JSON.stringify({ type, value }),
            }) as { pushed?: string[] };
            const pushed = Array.isArray(res?.pushed) ? res.pushed : [];
            if (pushed.length > 0) {
                addPendingBatch(pushed, 'command_ack', `BROADCAST ${label}`, d => `${label} → ${d}`);
            }
        } catch (err: unknown) {
            addLog('err', `✗ BROADCAST failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setCmdPending(null);
        }
    };

    const pushConfigAll = async () => {
        setCmdPending('config');
        addLog('info', '→ CONFIG push to all devices');
        try {
            const res = await fetchApi('/admin/push-config', { method: 'POST' }) as { pushed?: string[] };
            const pushed = Array.isArray(res?.pushed) ? res.pushed : [];
            if (pushed.length > 0) {
                addPendingBatch(pushed, 'config_ack', 'PUSH CONFIG calibration', d => `CONFIG → ${d}`);
            }
        } catch (err: unknown) {
            addLog('err', `✗ CONFIG push failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setCmdPending(null);
        }
    };

    const pushOta = async () => {
        if (!otaBinaryLink || !otaVersion) return;
        setOtaPending(true);
        addLog('info', `→ OTA v${otaVersion} → all devices`);
        try {
            const res = await fetchApi('/admin/ota', {
                method: 'POST',
                body: JSON.stringify({ version: otaVersion, binaryLink: otaBinaryLink, updateNow: true }),
            }) as { pushed?: string[] };
            const pushed = Array.isArray(res?.pushed) ? res.pushed : [];
            if (pushed.length > 0) {
                addPendingBatch(pushed, 'ota_ack', `OTA PUSH v${otaVersion}`, d => `OTA v${otaVersion} → ${d}`, 180_000);
            }
            localStorage.setItem('ota_last_link', otaBinaryLink);
            localStorage.setItem('ota_last_version', otaVersion);
            setLastOtaLink(otaBinaryLink);
            setLastOtaVersion(otaVersion);
            setOtaBinaryLink('');
            setOtaVersion('');
        } catch (err: unknown) {
            addLog('err', `✗ OTA push failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setOtaPending(false);
        }
    };

    const saveTariff = async (utilityType: 'electricity' | 'water', price: number, date: string) => {
        // Always create a new entry — preserves history and allows future-dated scheduling.
        // Patching the existing record would destroy the old rate and break findCurrent
        // if the new effective_date is in the future (no active tariff until that date).
        await fetchApi('/admin/tariff', {
            method: 'POST',
            body: JSON.stringify({ utility_type: utilityType, price_per_unit: price, effective_date: date }),
        });
        loadTariffs();
    };

    return (
        <>
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Control Center</h1>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Global tariff rates, sensor calibration, and broadcast device commands.
                    </p>
                </div>
                {lastUpdated && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                        <Clock className="h-3.5 w-3.5" />
                        Last updated: {lastUpdated}
                    </div>
                )}
            </div>

            {/* Tariff Configuration */}
            <div className="rounded-lg bg-white dark:bg-gray-800 p-6 shadow-sm ring-1 ring-gray-900/5 dark:ring-gray-700">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">Utility Tariffs</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                    <TariffCard
                        icon={<Zap className="h-4 w-4 text-yellow-500" />}
                        label="Electricity"
                        unit="Rp/kWh"
                        tariff={elecTariff}
                        pendingTariff={pendingElecTariff}
                        onSave={(p, d) => saveTariff('electricity', p, d)}
                    />
                    <TariffCard
                        icon={<Droplets className="h-4 w-4 text-cyan-500" />}
                        label="Water"
                        unit="Rp/m³"
                        tariff={waterTariff}
                        pendingTariff={pendingWaterTariff}
                        onSave={(p, d) => saveTariff('water', p, d)}
                    />
                </div>
            </div>

            {/* Calibration Settings */}
            <div className="rounded-lg bg-white dark:bg-gray-800 p-6 shadow-sm ring-1 ring-gray-900/5 dark:ring-gray-700">
                <div className="mb-5 flex items-center gap-3">
                    <div className="rounded-lg bg-primary/10 dark:bg-primary/20 p-2">
                        <SlidersHorizontal className="h-5 w-5 text-primary" />
                    </div>
                    <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Sensor Calibration</h2>
                </div>

                {loadingConfig ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500">Loading settings...</p>
                ) : (
                    <div className="space-y-6">
                        <InputField
                            label="Flow Rate Calibration Factor"
                            value={config.CAL_FACTOR_FLOWRATE}
                            serverValue={serverConfig.CAL_FACTOR_FLOWRATE}
                            min={0}
                            max={5}
                            step={0.01}
                            onChange={v => setConfig(c => ({ ...c, CAL_FACTOR_FLOWRATE: v }))}
                            onValidityChange={onFlowrateValid}
                        />
                        <InputField
                            label="Power Calibration Factor"
                            value={config.CAL_FACTOR_POWER}
                            serverValue={serverConfig.CAL_FACTOR_POWER}
                            min={0}
                            max={2}
                            step={0.01}
                            onChange={v => setConfig(c => ({ ...c, CAL_FACTOR_POWER: v }))}
                            onValidityChange={onPowerValid}
                        />
                        <InputField
                            label="Sensor Sampling Time"
                            value={config.SENSOR_SAMPLING_TIME}
                            serverValue={serverConfig.SENSOR_SAMPLING_TIME}
                            min={1}
                            max={10}
                            step={1}
                            unit="s"
                            onChange={v => setConfig(c => ({ ...c, SENSOR_SAMPLING_TIME: v }))}
                            onValidityChange={onSamplingValid}
                        />

                        <div className="flex items-center gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
                            <button
                                onClick={handleSave}
                                disabled={saving || !isDirty || hasInvalidInput}
                                className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <Save className="h-4 w-4" />
                                {saving ? 'Saving...' : 'Save to Server'}
                            </button>
                            <button
                                onClick={pushConfigAll}
                                disabled={!!cmdPending}
                                title="Push saved calibration from database to all devices"
                                className="flex items-center gap-1.5 rounded-md border border-gray-200 dark:border-gray-600 px-3 py-2 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {cmdPending === 'config' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SlidersHorizontal className="h-3.5 w-3.5" />}
                                Push to All Devices
                            </button>
                            {saveStatus === 'success' && (
                                <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                                    <CheckCircle className="h-4 w-4" /> Saved
                                </span>
                            )}
                            {saveStatus === 'error' && (
                                <span className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
                                    <AlertCircle className="h-4 w-4" /> Save failed
                                </span>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Broadcast Commands - all devices */}
            <div className="rounded-lg bg-white dark:bg-gray-800 p-6 shadow-sm ring-1 ring-gray-900/5 dark:ring-gray-700 space-y-5">
                <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-primary/10 dark:bg-primary/20 p-2">
                        <Radio className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Broadcast Commands</h2>
                        <p className="text-xs text-gray-400 dark:text-gray-500">Send relay / valve command to every device simultaneously</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1">
                            <Zap className="h-3.5 w-3.5 text-yellow-500" /> Relay (All Units)
                        </p>
                        <div className="flex gap-2">
                            <button onClick={() => setBroadcastConfirm({ type: 'relay', value: 1 })} disabled={!!cmdPending}
                                className="flex-1 rounded-md bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors">
                                {cmdPending === 'relay-1' ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : 'ON'}
                            </button>
                            <button onClick={() => setBroadcastConfirm({ type: 'relay', value: 0 })} disabled={!!cmdPending}
                                className="flex-1 rounded-md bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors">
                                {cmdPending === 'relay-0' ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : 'OFF'}
                            </button>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1">
                            <Droplets className="h-3.5 w-3.5 text-cyan-500" /> Valve (All Units)
                        </p>
                        <div className="flex gap-2">
                            <button onClick={() => setBroadcastConfirm({ type: 'valve', value: 1 })} disabled={!!cmdPending}
                                className="flex-1 rounded-md bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors">
                                {cmdPending === 'valve-1' ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : 'OPEN'}
                            </button>
                            <button onClick={() => setBroadcastConfirm({ type: 'valve', value: 0 })} disabled={!!cmdPending}
                                className="flex-1 rounded-md bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors">
                                {cmdPending === 'valve-0' ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : 'CLOSE'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* OTA Firmware Update */}
            <div className="rounded-lg bg-white dark:bg-gray-800 p-6 shadow-sm ring-1 ring-gray-900/5 dark:ring-gray-700 space-y-4">
                <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-primary/10 dark:bg-primary/20 p-2">
                        <UploadCloud className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">OTA Firmware Update</h2>
                        <p className="text-xs text-gray-400 dark:text-gray-500">Broadcast firmware binary link to all devices via MQTT</p>
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-4">
                    <div className="sm:col-span-3">
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Binary Link (URL to .bin)</label>
                        <input type="url" value={otaBinaryLink} onChange={e => setOtaBinaryLink(e.target.value)}
                            placeholder={lastOtaLink || "https://raw.githubusercontent.com/.../firmware.bin"}
                            maxLength={500}
                            className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Version</label>
                        <input type="text" value={otaVersion} onChange={e => setOtaVersion(e.target.value)}
                            placeholder={lastOtaVersion || "1.2.0"}
                            maxLength={20}
                            pattern="\d+\.\d+\.\d+"
                            title="Semantic version format: 1.2.0"
                            className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
                    </div>
                </div>

                <button onClick={pushOta} disabled={otaPending || !otaBinaryLink || !otaVersion}
                    className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    {otaPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                    {otaPending ? 'Pushing...' : 'Push OTA to All Devices'}
                </button>
            </div>

            {/* System Tools */}
            {(() => {
                const origin = new URL(API_BASE_URL).origin;
                const tools = [
                    {
                        label: 'Queue Monitor',
                        description: 'BullMQ job queues — telemetry, payment expiry, broadcast',
                        href: `${API_BASE_URL}/admin/queues`,
                        icon: <Terminal className="h-5 w-5 text-primary" />,
                    },
                    {
                        label: 'EMQX Dashboard',
                        description: 'MQTT broker — connections, authentication, topics',
                        href: `${origin}/emqx/`,
                        icon: <Radio className="h-5 w-5 text-primary" />,
                    },
                ];
                return (
                    <div className="rounded-lg bg-white dark:bg-gray-800 p-6 shadow-sm ring-1 ring-gray-900/5 dark:ring-gray-700">
                        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">System Tools</h2>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {tools.map(tool => (
                                <a
                                    key={tool.href}
                                    href={tool.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-start gap-3 rounded-lg border border-gray-200 dark:border-gray-600 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group"
                                >
                                    <div className="mt-0.5 rounded-lg bg-primary/10 dark:bg-primary/20 p-2 shrink-0">
                                        {tool.icon}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{tool.label}</span>
                                            <ExternalLink className="h-3.5 w-3.5 text-gray-400 group-hover:text-primary transition-colors" />
                                        </div>
                                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{tool.description}</p>
                                    </div>
                                </a>
                            ))}
                        </div>
                    </div>
                );
            })()}

            {/* MQTT Command Log */}
            <div className="rounded-lg bg-white dark:bg-gray-800 shadow-sm ring-1 ring-gray-900/5 dark:ring-gray-700 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-2">
                        <Terminal className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Command Log</span>
                        {log.length > 0 && (
                            <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-[10px] text-gray-500 dark:text-gray-400">{log.length}</span>
                        )}
                    </div>
                    {log.length > 0 && (
                        <button onClick={() => setLog([])} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">Clear</button>
                    )}
                </div>
                <div className="h-40 overflow-y-auto bg-gray-950 p-3 font-mono text-[11px] space-y-0.5">
                    {log.length === 0 ? (
                        <p className="text-gray-600">No commands sent yet.</p>
                    ) : (
                        log.map((entry) => (
                            <div key={entry.id} className={
                                entry.level === 'ok' ? 'text-green-400' :
                                entry.level === 'err' ? 'text-red-400' :
                                entry.level === 'pending' ? 'text-yellow-400 animate-pulse' :
                                'text-gray-300'
                            }>
                                <span className="text-gray-600 mr-2">[{entry.ts}]</span>{entry.text}
                            </div>
                        ))
                    )}
                </div>
            </div>

        </div>

        {/* Broadcast confirmation modal */}
        {broadcastConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <div className="mx-4 w-full max-w-md rounded-lg bg-white dark:bg-gray-800 shadow-xl ring-1 ring-gray-900/10 dark:ring-gray-700">
                    <div className="p-6">
                        <div>
                            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                                Confirm Broadcast Command
                            </h3>
                            <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-300">
                                This will send{' '}
                                <span className="font-semibold text-gray-900 dark:text-gray-100">
                                    {broadcastConfirm.type === 'relay' ? 'Relay' : 'Valve'}{' '}
                                    {broadcastConfirm.type === 'relay'
                                        ? broadcastConfirm.value === 1 ? 'ON' : 'OFF'
                                        : broadcastConfirm.value === 1 ? 'OPEN' : 'CLOSE'}
                                </span>{' '}
                                to <span className="font-semibold text-gray-900 dark:text-gray-100">all devices</span> simultaneously. This cannot be undone.
                            </p>
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                onClick={() => setBroadcastConfirm(null)}
                                className="rounded-md border border-gray-200 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    const { type, value } = broadcastConfirm;
                                    setBroadcastConfirm(null);
                                    sendCommandAll(type, value);
                                }}
                                className={`rounded-md px-4 py-2 text-sm font-medium text-white transition-colors ${
                                    broadcastConfirm.value === 1
                                        ? 'bg-green-600 hover:bg-green-700'
                                        : 'bg-red-600 hover:bg-red-700'
                                }`}
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}
