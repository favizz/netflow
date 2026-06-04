import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate } from "react-router-dom";
import { useIsDark } from "@/lib/useIsDark";
import { ArrowLeft, Power, Droplets, Zap, FileText, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Wifi, WifiOff, Activity, AlertTriangle, Trash2, Radio } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { cn } from "@/lib/utils";
import mqtt from "mqtt";
import { fetchApi } from "@/lib/api";
import { useToast } from "@/components/layout/ToastProvider";

function encodeCommand(type: 'relay' | 'valve', value: 0 | 1): Uint8Array {
    const typeNibble = type === 'relay' ? 0x10 : 0x20;
    return new Uint8Array([typeNibble | (value & 0x0f)]);
}

function decodeTelemetry(buf: Uint8Array): IoTPayload | null {
    if (buf.length !== 21 && buf.length !== 25) return null;
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const flagsOffset = buf.length >= 25 ? 24 : 20;
    return {
        et: view.getUint32(0, false)  / 100,
        p:  view.getUint16(4, false)  / 10,
        v:  view.getUint16(6, false)  / 10,
        c:  view.getUint16(8, false)  / 1000,
        wf: view.getUint16(10, false) / 100,
        wt: view.getUint32(12, false) / 1000,
        te: buf.length >= 25 ? view.getUint32(16, false) / 1000 : undefined,
        tw: buf.length >= 25 ? view.getUint32(20, false) / 1000 : undefined,
        rs: buf[flagsOffset] & 1,
        vs: (buf[flagsOffset] >> 1) & 1,
    };
}

type TimePeriod = "live" | "daily" | "yearly" | "monthly";
type LiveMetric = "power" | "voltage" | "current";

const PERIODS: { id: TimePeriod; label: string }[] = [
    { id: "daily",   label: "Harian"  },
    { id: "monthly", label: "Bulanan" },
    { id: "yearly",  label: "Tahunan" },
    { id: "live",    label: "Live"    },
];

const LIVE_METRICS: { id: LiveMetric; label: string; unit: string; color: string }[] = [
    { id: "power",   label: "Power",   unit: "W",   color: "#3b82f6" },
    { id: "voltage", label: "Voltage", unit: "V",   color: "#f59e0b" },
    { id: "current", label: "Current", unit: "A",   color: "#8b5cf6" },
];

interface LogEntry {
    timestamp: string;
    value: number;
    unit: string;
    rawPayload: string;
    details?: IoTPayload;
}

interface IoTPayload {
    et?: number;
    p?: number;
    v?: number;
    c?: number;
    wf?: number;
    wt?: number;
    te?: number;
    tw?: number;
    rs?: number;
    vs?: number;
}

const MQTT_CONFIG = {
    brokerUrl: import.meta.env.VITE_MQTT_BROKER_URL as string,
    options: {
        clientId: 'ta-dashboard-' + Math.random().toString(16).substring(2, 10),
        username: import.meta.env.VITE_MQTT_USERNAME || undefined,
        password: import.meta.env.VITE_MQTT_PASSWORD || undefined,
        reconnectPeriod: 5000,
    }
};

type RawTrendRow = { bucket: string; kwh?: unknown; waterM3?: unknown; water_m3?: unknown };
type AnomalyRow = {
    anomalyType?: string;
    type?: string;
    severity?: string;
    message?: string;
    detectedAt?: string;
    timestamp?: string;
    [key: string]: unknown;
};

function getDefaultPeriodKey(period: TimePeriod): string {
    const now = new Date();
    if (period === "daily")   return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (period === "monthly") return String(now.getFullYear());
    return '';
}

function offsetKey(key: string, period: TimePeriod, delta: number): string {
    if (period === "daily") {
        const [y, m] = key.split('-').map(Number);
        const d = new Date(y, m - 1 + delta);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    if (period === "monthly") return String(Number(key) + delta);
    return '';
}

function periodKeyLabel(key: string, period: TimePeriod): string {
    if (period === "daily") {
        const [y, m] = key.split('-').map(Number);
        return new Date(y, m - 1).toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });
    }
    if (period === "monthly") return key;
    return '';
}

type ConfirmAction = { type: 'power'; next: boolean } | { type: 'water'; next: boolean } | { type: 'delete' } | null;

function PeriodDropdown({ value, onChange }: { value: TimePeriod; onChange: (v: TimePeriod) => void }) {
    const [open, setOpen] = useState(false);
    const [dropPos, setDropPos] = useState({ top: 0, right: 0 });
    const btnRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const current = PERIODS.find(p => p.id === value);

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => {
            if (!btnRef.current?.contains(e.target as Node) && !panelRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);

    const handleToggle = () => {
        if (!open && btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect();
            setDropPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
        }
        setOpen(o => !o);
    };

    return (
        <div className="relative">
            <button
                ref={btnRef}
                onClick={handleToggle}
                className="flex items-center gap-2 h-8 rounded-md border border-gray-200 dark:border-gray-600 px-3 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 bg-white dark:bg-gray-700"
            >
                {current?.label ?? value}
                <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {open && createPortal(
                <div
                    ref={panelRef}
                    style={{ position: 'fixed', top: dropPos.top, right: dropPos.right, zIndex: 9999 }}
                    className="min-w-[140px] rounded-md bg-white dark:bg-gray-800 py-1 shadow-lg ring-1 ring-black/5 dark:ring-gray-700"
                >
                    {PERIODS.map(p => (
                        <button key={p.id} onClick={() => { onChange(p.id); setOpen(false); }}
                            className={cn("block w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700",
                                value === p.id ? "text-primary font-medium" : "text-gray-700 dark:text-gray-300")}>
                            {p.label}
                        </button>
                    ))}
                </div>,
                document.body
            )}
        </div>
    );
}

export default function UnitDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const isDark = useIsDark();
    const toast = useToast();

    const gridColor = isDark ? '#374151' : '#E5E7EB';
    const tickColor = '#9CA3AF';
    const tooltipStyle = {
        borderRadius: '8px',
        border: `1px solid ${isDark ? '#374151' : '#E5E7EB'}`,
        background: isDark ? '#1F2937' : '#ffffff',
        color: isDark ? '#F3F4F6' : '#111827',
        fontSize: '12px',
    };

    type UnitInfoState = { unit: string; tenant: string; meterSerial: string; status: string; lastUpdate: string; relay_status?: number; valve_status?: number; token_electricity?: number; token_water?: number; };
    const [unitInfo, setUnitInfo] = useState<UnitInfoState | null>(null);
    const [loadingInfo, setLoadingInfo] = useState(true);
    const [anomalies, setAnomalies] = useState<AnomalyRow[]>([]);

    const [powerState, setPowerState] = useState(false);
    const [waterState, setWaterState] = useState(false);
    const [period, setPeriod] = useState<TimePeriod>("live");
    const [isLogsOpen, setIsLogsOpen] = useState(false);

    // Confirmation modal state
    const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
    const [actionPending, setActionPending] = useState(false);

    const [livePowerMetric, setLivePowerMetric] = useState<LiveMetric>("power");

    const [isConnected, setIsConnected] = useState(false);
    const [mqttClient, setMqttClient] = useState<mqtt.MqttClient | null>(null);
    const [realTimePower, setRealTimePower] = useState<{ time: string; watts: number; voltage: number; current: number; timestamp: string }[]>([]);
    const [realTimeWater, setRealTimeWater] = useState<{ time: string; value: number; timestamp: string }[]>([]);
    const [liveLogs, setLiveLogs] = useState<LogEntry[]>([]);

    const [historicalTrends, setHistoricalTrends] = useState<{ time: string; powerVal: number; waterVal: number; }[]>([]);
    const [rawTrendData, setRawTrendData] = useState<RawTrendRow[]>([]);
    const [periodKey, setPeriodKey] = useState(() => getDefaultPeriodKey("daily"));
    const [hasPrev, setHasPrev] = useState(false);
    const [hasNext, setHasNext] = useState(false);
    const [trendLoading, setTrendLoading] = useState(false);

    const [energyStats, setEnergyStats] = useState({ total_kwh: 0, active_power_w: 0, voltage_v: 0, current_a: 0 });
    const [waterStats, setWaterStats] = useState({ total_m3: 0, flow_rate_lpm: 0 });

    useEffect(() => {
        if (!id) return;
        fetchApi(`/unit/${id}`)
            .then(data => {
                setUnitInfo({
                    unit: data.unit_no,
                    tenant: data.resident_email || "Unassigned",
                    meterSerial: data.device_id,
                    status: "Unknown",
                    lastUpdate: "Wait...",
                    token_electricity: Number(data.token_electricity || 0),
                    token_water: Number(data.token_water || 0),
                });
                setEnergyStats({ total_kwh: Number(data.last_energy_reading || 0), active_power_w: 0, voltage_v: 0, current_a: 0 });
                setWaterStats({ total_m3: Number(data.last_water_reading || 0), flow_rate_lpm: 0 });
                setPowerState(!!data.relay_status);
                setWaterState(!!data.valve_status);

                fetchApi(`/admin/anomalies/${data.unit_no}`)
                    .then(anomalyData => {
                        setAnomalies(anomalyData || []);
                    })
                    .catch(() => {});

                return fetchApi('/unit/connectivity');
            })
            .then(conn => {
                setUnitInfo((prev: UnitInfoState | null) => {
                    if (!prev) return prev;
                    const isOnline = Array.isArray(conn.units) && conn.units.some((u: { online: boolean; deviceId: string; }) => u.online && u.deviceId === prev.meterSerial);
                    return { ...prev, status: isOnline ? "Online" : "Offline", lastUpdate: "Live Data" };
                });
            })
            .catch(() => {})
            .finally(() => setLoadingInfo(false));

    }, [id]);

    // Reset periodKey when period changes
    useEffect(() => {
        setPeriodKey(getDefaultPeriodKey(period));
        setHasPrev(false);
        setHasNext(false);
        setRawTrendData([]);
        setHistoricalTrends([]);
    }, [period]);

    // Fetch raw trend data when unit or period changes (not on periodKey changes)
    useEffect(() => {
        if (!unitInfo?.unit || period === "live") return;
        let cancelled = false;
        setTrendLoading(true);
        const apiPeriod = period === "daily" ? "daily" : "monthly";
        fetchApi(`/reporting/trends/${encodeURIComponent(unitInfo.unit)}?period=${apiPeriod}`)
            .then(raw => {
                if (cancelled) return;
                setRawTrendData((raw || []) as RawTrendRow[]);
            })
            .catch(() => { if (!cancelled) { setRawTrendData([]); setHistoricalTrends([]); } })
            .finally(() => { if (!cancelled) setTrendLoading(false); });
        return () => { cancelled = true; };
    }, [unitInfo?.unit, period]);

    // Filter raw data by periodKey and compute hasPrev/hasNext
    useEffect(() => {
        if (period === "live" || rawTrendData.length === 0) return;

        if (period === "yearly") {
            // Aggregate monthly buckets → one bar per year
            const yearMap = new Map<string, { powerVal: number; waterVal: number }>();
            rawTrendData.forEach(t => {
                const year = String(new Date(t.bucket).getFullYear());
                const e = yearMap.get(year) || { powerVal: 0, waterVal: 0 };
                yearMap.set(year, {
                    powerVal: e.powerVal + Number(t.kwh || 0),
                    waterVal: e.waterVal + Number(t.waterM3 || t.water_m3 || 0),
                });
            });
            setHistoricalTrends(
                [...yearMap.entries()]
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([year, vals]) => ({ time: year, ...vals }))
            );
            setHasPrev(false);
            setHasNext(false);
            return;
        }

        let filtered = rawTrendData;
        if (period === "daily") {
            filtered = rawTrendData.filter(t => {
                const d = new Date(t.bucket);
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === periodKey;
            });
        } else if (period === "monthly") {
            filtered = rawTrendData.filter(t => String(new Date(t.bucket).getFullYear()) === periodKey);
        }

        setHistoricalTrends(filtered.map(t => ({
            time: period === "daily"
                ? new Date(t.bucket).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
                : new Date(t.bucket).toLocaleDateString('id-ID', { month: 'short' }),
            powerVal: Number(t.kwh || 0),
            waterVal: Number(t.waterM3 || t.water_m3 || 0),
        })));

        const allKeys = rawTrendData.map(t => {
            const d = new Date(t.bucket);
            return period === "daily"
                ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                : String(d.getFullYear());
        });
        const unique = [...new Set(allKeys)];
        const prevKey = offsetKey(periodKey, period, -1);
        const nextKey = offsetKey(periodKey, period, 1);
        setHasPrev(unique.includes(prevKey));
        setHasNext(nextKey <= getDefaultPeriodKey(period) && unique.includes(nextKey));
    }, [rawTrendData, periodKey, period]);

    // Auto-refresh anomalies every 10 seconds
    useEffect(() => {
        if (!unitInfo?.unit) return;

        const intervalId = setInterval(() => {
            fetchApi(`/admin/anomalies/${unitInfo.unit}`)
                .then(anomalyData => {
                    setAnomalies(anomalyData || []);
                })
                .catch(() => {});
        }, 10000);

        return () => clearInterval(intervalId);
    }, [unitInfo?.unit]);

    // MQTT live connection
    useEffect(() => {
        if (!unitInfo?.meterSerial || period !== "live") {
            return;
        }

        const client = mqtt.connect(MQTT_CONFIG.brokerUrl, MQTT_CONFIG.options);
        const telemetryTopic = `device/${unitInfo.meterSerial}/data`;

        client.on('connect', () => {
            setIsConnected(true);
            client.subscribe([telemetryTopic]);
        });

        client.on('message', (topic, message) => {
            const now = new Date();
            const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            try {
                let parsed: IoTPayload | null = null;

                parsed = decodeTelemetry(new Uint8Array(message));

                if (!parsed) return;

                if (topic === telemetryTopic) {
                    setUnitInfo((prev: UnitInfoState | null) => prev?.status !== "Online" ? { ...prev!, status: "Online" } : prev);
                    // Device is provably online — clear stale offline anomaly immediately
                    setAnomalies(prev => prev.filter(a => (a.anomalyType ?? a.type) !== 'device_offline'));
                    setEnergyStats(prev => ({
                        total_kwh: parsed.et ?? prev.total_kwh,
                        active_power_w: parsed.p ?? 0,
                        voltage_v: parsed.v ?? 0,
                        current_a: parsed.c ?? 0,
                    }));
                    if (parsed.rs !== undefined) setPowerState(parsed.rs === 1);

                    if (parsed.p !== undefined || parsed.v !== undefined || parsed.c !== undefined) {
                        setRealTimePower(prev => [...prev.slice(-59), {
                            time: timeStr,
                            watts:   parsed!.p ?? 0,
                            voltage: parsed!.v ?? 0,
                            current: parsed!.c ?? 0,
                            timestamp: now.toISOString(),
                        }]);
                    }
                    if (parsed.wf !== undefined) {
                        setRealTimeWater(prev => [...prev.slice(-59), { time: timeStr, value: parsed!.wf ?? 0, timestamp: now.toISOString() }]);
                    }

                    setWaterStats(prev => ({ total_m3: parsed.wt ?? prev.total_m3, flow_rate_lpm: parsed.wf ?? 0 }));
                    if (parsed.vs !== undefined) setWaterState(parsed.vs === 1);

                    const rawLabel = 'Binary 21B';
                    setLiveLogs(prev => [{
                        timestamp: now.toISOString(),
                        value: parsed?.p ?? 0,
                        unit: 'W',
                        rawPayload: `[${rawLabel}] et:${parsed?.et} p:${parsed?.p} v:${parsed?.v} c:${parsed?.c} wf:${parsed?.wf} wt:${parsed?.wt} rs:${parsed?.rs} vs:${parsed?.vs}`,
                        details: parsed!,
                    }, ...prev.slice(0, 49)]);
                }
            } catch { /* malformed frame */ }
        });

        client.on('error', (err) => {
            setIsConnected(false);
            setUnitInfo((prev: UnitInfoState | null) => (prev ? { ...prev, status: "Offline" } : null));
            const raw = err?.message ?? String(err);
            if (raw.includes("Bad username") || raw.includes("Not authorized") || raw.includes("Connection refused")) {
                toast.error("MQTT authentication failed. Check broker credentials in environment config.");
            } else {
                toast.error("Live connection lost. Reconnecting...");
            }
        });

        setMqttClient(client);
        return () => {
            client.end();
            setIsConnected(false);
            setMqttClient(null);
        };
    }, [unitInfo?.meterSerial, period, toast]);

    const handleConfirm = async () => {
        if (!confirmAction) return;
        setActionPending(true);
        try {
            if (confirmAction.type === 'delete') {
                await fetchApi(`/unit/${id}`, { method: 'DELETE' });
                toast.success(`Unit ${unitInfo?.unit} deleted.`);
                navigate('/devices');
                return;
            }
            if (confirmAction.type === 'power') {
                const newState = confirmAction.next;
                setPowerState(newState);
                // Update DB state
                if (id) await fetchApi(`/unit/${id}/relay`, { method: 'PATCH', body: JSON.stringify({ relayStatus: newState }) });
                // Send MQTT command via backend (retained publish, works regardless of browser MQTT state)
                if (unitInfo?.meterSerial) {
                    await fetchApi(`/admin/command/${unitInfo.meterSerial}`, {
                        method: 'POST',
                        body: JSON.stringify({ type: 'relay', value: newState ? 1 : 0 }),
                    });
                    setLiveLogs(prev => [{
                        timestamp: new Date().toISOString(), value: newState ? 1 : 0, unit: 'CMD',
                        rawPayload: `OUTGOING [Backend] device/${unitInfo.meterSerial}/command: relay=${newState ? 1 : 0}`,
                    }, ...prev.slice(0, 49)]);
                }
                toast.success(`Power supply ${newState ? 'enabled' : 'disabled'}.`);
            }
            if (confirmAction.type === 'water') {
                const newState = confirmAction.next;
                setWaterState(newState);
                // Update DB state
                if (id) await fetchApi(`/unit/${id}/valve`, { method: 'PATCH', body: JSON.stringify({ valveStatus: newState }) });
                // Send MQTT command via backend (retained publish, works regardless of browser MQTT state)
                if (unitInfo?.meterSerial) {
                    await fetchApi(`/admin/command/${unitInfo.meterSerial}`, {
                        method: 'POST',
                        body: JSON.stringify({ type: 'valve', value: newState ? 1 : 0 }),
                    });
                    setLiveLogs(prev => [{
                        timestamp: new Date().toISOString(), value: newState ? 1 : 0, unit: 'CMD',
                        rawPayload: `OUTGOING [Backend] device/${unitInfo.meterSerial}/command: valve=${newState ? 1 : 0}`,
                    }, ...prev.slice(0, 49)]);
                }
                toast.success(`Water valve ${newState ? 'opened' : 'closed'}.`);
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Action failed');
        } finally {
            setActionPending(false);
            setConfirmAction(null);
        }
    };

    if (loadingInfo) {
        return <div className="p-6 text-gray-500 dark:text-gray-400">Loading unit data...</div>;
    }
    if (!unitInfo) {
        return <div className="p-6 text-red-500 dark:text-red-400">Unit not found.</div>;
    }

    const isOnline = unitInfo.status === "Online";
    const isLive = period === "live";
    const activeLiveMetric = LIVE_METRICS.find(m => m.id === livePowerMetric) ?? LIVE_METRICS[0];
    const displayPowerData = isLive
        ? realTimePower.map(p => ({
              time: p.time,
              value: livePowerMetric === "power" ? p.watts : livePowerMetric === "voltage" ? p.voltage : p.current,
          }))
        : historicalTrends.map(t => ({ time: t.time, value: t.powerVal }));
    const displayWaterData = isLive ? realTimeWater : historicalTrends.map(t => ({ time: t.time, value: t.waterVal }));

    return (
        <div className="space-y-6">
            {/* Confirmation Modal */}
            {confirmAction && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="w-full max-w-sm rounded-xl bg-white dark:bg-gray-800 shadow-xl ring-1 ring-gray-900/5 dark:ring-gray-700 p-6 space-y-4">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            {confirmAction.type === 'delete'
                                ? 'Delete Unit'
                                : confirmAction.type === 'power'
                                ? `${confirmAction.next ? 'Enable' : 'Disable'} Power Supply`
                                : `${confirmAction.next ? 'Open' : 'Close'} Water Valve`
                            }
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            {confirmAction.type === 'delete'
                                ? `This will permanently delete unit ${unitInfo.unit}. This action cannot be undone.`
                                : confirmAction.type === 'power'
                                ? confirmAction.next
                                    ? 'Main grid will be reconnected. Ensure the unit is ready.'
                                    : 'Power to this unit will be cut. All electrical appliances will turn off.'
                                : confirmAction.next
                                    ? 'Water valve will be opened. Water supply will resume.'
                                    : 'Water supply to this unit will be stopped.'
                            }
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                disabled={actionPending}
                                onClick={() => setConfirmAction(null)}
                                className="rounded-md border border-gray-200 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                disabled={actionPending}
                                onClick={() => void handleConfirm()}
                                className={cn(
                                    "rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60 transition-colors",
                                    confirmAction.type === 'delete' || ('next' in confirmAction && confirmAction.next === false)
                                        ? "bg-red-600 hover:bg-red-700"
                                        : "bg-primary hover:bg-primary/90"
                                )}
                            >
                                {actionPending ? 'Processing...' : 'Confirm'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center space-x-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
                            {unitInfo.unit}
                            <span className={cn(
                                "text-sm font-medium px-2.5 py-0.5 rounded-full border",
                                isOnline
                                    ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
                                    : "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800"
                            )}>
                                {unitInfo.status}
                            </span>
                        </h1>
                        <p className="text-gray-500 dark:text-gray-400">{unitInfo.tenant} · {unitInfo.meterSerial}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {isLive && (
                        <div className={cn("px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2 border", isConnected ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800" : "bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600")}>
                            {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                            {isConnected ? "Live" : "Connecting..."}
                        </div>
                    )}
                </div>
            </div>

            {anomalies.length > 0 && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl p-4 flex flex-col gap-3 shadow-sm">
                    {anomalies.map((anomaly, idx) => (
                        <div key={idx} className="flex items-start gap-3">
                            <div className="p-2 bg-red-100 dark:bg-red-900/50 rounded-full shrink-0">
                                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-red-800 dark:text-red-300 uppercase tracking-wider">
                                    {(anomaly.type || anomaly.anomalyType || 'ANOMALY').replace('_', ' ')}
                                </h4>
                                <p className="text-sm text-red-700 dark:text-red-400 mt-0.5">
                                    {anomaly.message}
                                </p>
                                <span className="text-xs text-red-500/80 dark:text-red-400/70 mt-1 block font-medium">
                                    Terdeteksi: {new Date(anomaly.timestamp || anomaly.detectedAt || Date.now()).toLocaleString('id-ID')}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-6">
                        {/* Utility Controls */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
                        <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Utility Controls</h2>
                        <div className="space-y-1">
                            <div className="flex items-center justify-between py-2">
                                <div className="flex items-center gap-2">
                                    <Power className={cn("w-4 h-4", powerState ? "text-primary" : "text-gray-400 dark:text-gray-500")} />
                                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Power Supply</span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={powerState}
                                        onChange={(e) => setConfirmAction({ type: 'power', next: e.target.checked })}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                </label>
                            </div>
                            <div className="flex items-center justify-between py-2">
                                <div className="flex items-center gap-2">
                                    <Droplets className={cn("w-4 h-4", waterState ? "text-cyan-500" : "text-gray-400 dark:text-gray-500")} />
                                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Water Supply</span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={waterState}
                                        onChange={(e) => setConfirmAction({ type: 'water', next: e.target.checked })}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-1 gap-4">
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-3">
                                <Activity className={cn("w-4 h-4", isConnected ? "text-green-500 animate-pulse" : "text-gray-300 dark:text-gray-600")} />
                            </div>
                            <div className="flex items-center gap-3 mb-3">
                                <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-amber-600 dark:text-amber-400">
                                    <Zap className="w-5 h-5" />
                                </div>
                                <h3 className="font-semibold text-gray-900 dark:text-gray-100">Electricity</h3>
                            </div>
                            <div className="space-y-3">
                                <div className="grid grid-cols-3 gap-2">
                                    <div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium">Power</p>
                                        <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                                            {energyStats.active_power_w.toFixed(1)} <span className="text-xs font-medium text-gray-500 dark:text-gray-400">W</span>
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium">Voltage</p>
                                        <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                                            {energyStats.voltage_v.toFixed(1)} <span className="text-xs font-medium text-gray-500 dark:text-gray-400">V</span>
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium">Current</p>
                                        <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                                            {energyStats.current_a.toFixed(2)} <span className="text-xs font-medium text-gray-500 dark:text-gray-400">A</span>
                                        </p>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium">Total Energy</p>
                                    <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">
                                        {energyStats.total_kwh.toFixed(2)} <span className="text-sm font-medium text-gray-500 dark:text-gray-400">kWh</span>
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        Sisa: <span className={cn("font-semibold", (unitInfo.token_electricity || 0) < 5 ? "text-red-500 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")}>
                                            {(unitInfo.token_electricity || 0).toFixed(2)} kWh
                                        </span>
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-3">
                                <Activity className={cn("w-4 h-4", isConnected ? "text-cyan-500 animate-pulse" : "text-gray-300 dark:text-gray-600")} />
                            </div>
                            <div className="flex items-center gap-3 mb-3">
                                <div className="p-2 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg text-cyan-600 dark:text-cyan-400">
                                    <Droplets className="w-5 h-5" />
                                </div>
                                <h3 className="font-semibold text-gray-900 dark:text-gray-100">Water Flow</h3>
                            </div>
                            <div className="space-y-3">
                                <div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium">Flow Rate</p>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                        {waterStats.flow_rate_lpm.toFixed(2)} <span className="text-sm font-medium text-gray-500 dark:text-gray-400">L/min</span>
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium">Total Volume</p>
                                    <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">
                                        {waterStats.total_m3.toFixed(2)} <span className="text-sm font-medium text-gray-500 dark:text-gray-400">m³</span>
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        Sisa: <span className={cn("font-semibold", (unitInfo.token_water || 0) < 1 ? "text-red-500 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")}>
                                            {(unitInfo.token_water || 0).toFixed(2)} m³
                                        </span>
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={() => setConfirmAction({ type: 'delete' })}
                        className="w-full flex items-center justify-center gap-1.5 rounded-md border border-red-200 dark:border-red-800 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                        Delete Unit
                    </button>
                </div>

                <div className="lg:col-span-2 space-y-6">
                    {/* Period selector */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm px-4 py-3 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                                {isLive && (
                                    <Radio className={cn("w-3.5 h-3.5", isConnected ? "text-red-500 animate-pulse" : "text-gray-400")} />
                                )}
                                {isLive ? (isConnected ? "Live" : "Connecting...") : "Rentang Waktu"}
                            </div>
                            <PeriodDropdown value={period} onChange={setPeriod} />
                        </div>
                        {(period === "daily" || period === "monthly") && (
                            <div className="flex items-center justify-center gap-0.5">
                                <button
                                    onClick={() => setPeriodKey(k => offsetKey(k, period, -1))}
                                    disabled={!hasPrev}
                                    className="rounded p-0.5 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 min-w-[80px] text-center">
                                    {periodKeyLabel(periodKey, period)}
                                </span>
                                <button
                                    onClick={() => setPeriodKey(k => offsetKey(k, period, 1))}
                                    disabled={!hasNext}
                                    className="rounded p-0.5 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Power Chart */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Electricity</h3>
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                                {isLive
                                    ? `Live (${activeLiveMetric.unit})`
                                    : period === "yearly" ? "Tahunan (kWh)" : period === "monthly" ? "Bulanan (kWh)" : "Harian (kWh)"}
                            </span>
                        </div>

                        {/* Live metric sub-selector */}
                        {isLive && (
                            <div className="flex gap-1 mb-4 p-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
                                {LIVE_METRICS.map(({ id, label }) => (
                                    <button
                                        key={id}
                                        onClick={() => setLivePowerMetric(id)}
                                        className={`flex-1 py-1.5 px-2 rounded-md text-xs font-semibold transition-colors ${
                                            livePowerMetric === id
                                                ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm"
                                                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        )}

                        {trendLoading ? (
                            <div className="h-[250px] flex items-center justify-center text-sm text-gray-400">Loading...</div>
                        ) : (
                            <div className="w-full">
                                {displayPowerData.length > 0 && (
                                    <div className="mb-3 flex items-baseline gap-1.5">
                                        <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                            {isLive
                                                ? Math.max(...displayPowerData.map(d => d.value)).toFixed(livePowerMetric === "current" ? 3 : livePowerMetric === "voltage" ? 1 : 0)
                                                : historicalTrends.reduce((s, t) => s + t.powerVal, 0).toFixed(2)}
                                        </span>
                                        <span className="text-sm text-gray-500 dark:text-gray-400">
                                            {isLive ? `${activeLiveMetric.unit} peak` : "kWh total"}
                                        </span>
                                    </div>
                                )}
                                <ResponsiveContainer width="100%" height={250}>
                                    <AreaChart data={displayPowerData}>
                                        <defs>
                                            <linearGradient id="colorPower" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={activeLiveMetric.color} stopOpacity={0.2} />
                                                <stop offset="95%" stopColor={activeLiveMetric.color} stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                                        <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: tickColor, fontSize: 11 }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: tickColor, fontSize: 11 }} width={36} />
                                        <RechartsTooltip
                                            contentStyle={tooltipStyle}
                                            cursor={{ stroke: activeLiveMetric.color, strokeWidth: 1, strokeDasharray: '3 3' }}
                                            formatter={(val: unknown) => [`${Number(val ?? 0).toFixed(isLive && livePowerMetric === "current" ? 3 : 2)} ${isLive ? activeLiveMetric.unit : "kWh"}`, isLive ? activeLiveMetric.label : "Consumption"] as [string, string]}
                                        />
                                        <Area type="monotone" dataKey="value" stroke={activeLiveMetric.color} strokeWidth={2} fillOpacity={1} fill="url(#colorPower)" dot={false} activeDot={isLive ? false : { r: 4 }} isAnimationActive={!isLive} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>

                    {/* Water Chart */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Water</h3>
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                                {isLive ? "Live (L/min)" : period === "yearly" ? "Tahunan (m³)" : period === "monthly" ? "Bulanan (m³)" : "Harian (m³)"}
                            </span>
                        </div>
                        {trendLoading ? (
                            <div className="h-[250px] flex items-center justify-center text-sm text-gray-400">Loading...</div>
                        ) : (
                            <div className="w-full">
                                {displayWaterData.length > 0 && (
                                    <div className="mb-3 flex items-baseline gap-1.5">
                                        <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                            {isLive
                                                ? Math.max(...displayWaterData.map(d => d.value)).toFixed(2)
                                                : historicalTrends.reduce((s, t) => s + t.waterVal, 0).toFixed(3)}
                                        </span>
                                        <span className="text-sm text-gray-500 dark:text-gray-400">
                                            {isLive ? "L/min peak" : "m³ total"}
                                        </span>
                                    </div>
                                )}
                                <ResponsiveContainer width="100%" height={250}>
                                    <LineChart data={displayWaterData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                                        <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: tickColor, fontSize: 11 }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: tickColor, fontSize: 11 }} width={36} />
                                        <RechartsTooltip contentStyle={tooltipStyle} cursor={{ stroke: '#06b6d4', strokeWidth: 1, strokeDasharray: '3 3' }} />
                                        <Line type="monotone" dataKey="value" stroke="#06b6d4" strokeWidth={2} dot={false} activeDot={isLive ? false : { r: 4 }} isAnimationActive={!isLive} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>

                    {/* Raw Logs */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                        <button
                            onClick={() => setIsLogsOpen(!isLogsOpen)}
                            className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                                <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Raw Sensor Logs (Validation)</span>
                            </div>
                            {isLogsOpen ? <ChevronUp className="w-4 h-4 text-gray-500 dark:text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400" />}
                        </button>

                        {isLogsOpen && (
                            <div className="overflow-x-auto max-h-96">
                                <table className="w-full text-left text-xs font-mono">
                                    <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 sticky top-0">
                                        <tr>
                                            <th className="px-4 py-2 font-medium">Timestamp</th>
                                            <th className="px-4 py-2 font-medium">Value</th>
                                            <th className="px-4 py-2 font-medium">Unit</th>
                                            <th className="px-4 py-2 font-medium">Raw Payload</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                        {liveLogs.length > 0 ? liveLogs.map((log, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                                <td className="px-4 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">{log.timestamp}</td>
                                                <td className="px-4 py-2 text-gray-900 dark:text-gray-100 font-bold">{log.value}</td>
                                                <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{log.unit}</td>
                                                <td className="px-4 py-2 text-slate-600 dark:text-slate-400 truncate max-w-xs" title={log.rawPayload}>
                                                    {log.rawPayload}
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan={4} className="px-4 py-4 text-center text-gray-500 dark:text-gray-400">No logs yet...</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
