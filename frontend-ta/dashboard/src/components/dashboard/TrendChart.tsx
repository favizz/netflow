import { useEffect, useState, useRef } from "react";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { ChevronLeft, ChevronRight, Zap, Droplets, Radio } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { useIsDark } from "@/lib/useIsDark";
import { MQTT_CONFIG } from "@/lib/constants";
import mqtt from "mqtt";

type Utility = 'electricity' | 'water';
type Period = 'daily' | 'monthly' | 'yearly' | 'live';
type LiveMetric = 'power' | 'voltage' | 'current';

const COLORS: Record<Utility, string> = {
    electricity: '#f59e0b',
    water: '#06b6d4',
};

const LABELS: Record<Utility, { title: string; unit: string }> = {
    electricity: { title: 'Electricity', unit: 'kWh' },
    water: { title: 'Water', unit: 'm³' },
};

const LIVE_METRICS: { id: LiveMetric; label: string; unit: string; color: string }[] = [
    { id: 'power',   label: 'Power',   unit: 'W',   color: '#f59e0b' },
    { id: 'voltage', label: 'Voltage', unit: 'V',   color: '#ef4444' },
    { id: 'current', label: 'Current', unit: 'A',   color: '#8b5cf6' },
];

function getCurrentPeriodKey(period: Period): string {
    const now = new Date();
    if (period === 'daily') return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (period === 'monthly') return String(now.getFullYear());
    return 'all';
}

function offsetPeriodKey(key: string, period: 'daily' | 'monthly' | 'yearly', delta: number): string {
    if (period === 'daily') {
        const [y, m] = key.split('-').map(Number);
        const date = new Date(y, m - 1 + delta);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
    if (period === 'monthly') return String(Number(key) + delta);
    return 'all';
}

function periodLabel(key: string, period: Period): string {
    if (period === 'daily') {
        const [y, m] = key.split('-').map(Number);
        return new Date(y, m - 1).toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });
    }
    if (period === 'monthly') return key;
    return 'All Time';
}

function decodeTelemetry(buf: Uint8Array): { p?: number; v?: number; c?: number; wf?: number } | null {
    if (buf.length < 21) return null;
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    return {
        p:  view.getUint16(4, false) / 10,
        v:  view.getUint16(6, false) / 10,
        c:  view.getUint16(8, false) / 1000,
        wf: view.getUint16(10, false) / 100,
    };
}

interface TrendData {
    name: string;
    electricity: number;
    water: number;
}

interface TrendResponse {
    bucket: string;
    kwh?: number;
    waterM3?: number;
    water_m3?: number;
}

export function TrendChart() {
    const isDark = useIsDark();
    const gridColor = isDark ? '#374151' : '#E5E7EB';
    const tickColor = isDark ? '#9CA3AF' : '#9CA3AF';
    const tooltipStyle = {
        borderRadius: '8px',
        border: `1px solid ${isDark ? '#374151' : '#E5E7EB'}`,
        background: isDark ? '#1F2937' : '#ffffff',
        color: isDark ? '#F3F4F6' : '#111827',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        fontSize: '12px',
    };

    const [utility, setUtility] = useState<Utility>('electricity');
    const [period, setPeriod] = useState<Period>('monthly');
    const [periodKey, setPeriodKey] = useState(() => getCurrentPeriodKey('monthly'));
    const [data, setData] = useState<TrendData[]>([]);
    const [loading, setLoading] = useState(true);
    const [hasPrev, setHasPrev] = useState(false);
    const [hasNext, setHasNext] = useState(false);
    const todayKey = useRef(getCurrentPeriodKey('monthly'));

    // First unit info
    const [firstUnitNo, setFirstUnitNo] = useState<string | null>(null);
    const [firstDeviceId, setFirstDeviceId] = useState<string | null>(null);

    // Live mode
    const [livePowerMetric, setLivePowerMetric] = useState<LiveMetric>('power');
    const [liveElecData, setLiveElecData] = useState<{ time: string; power: number; voltage: number; current: number }[]>([]);
    const [liveWaterData, setLiveWaterData] = useState<{ time: string; flow: number }[]>([]);
    const [isConnected, setIsConnected] = useState(false);

    // Fetch first unit info once on mount
    useEffect(() => {
        fetchApi('/unit')
            .then((units: { unit_no: string; device_id?: string }[]) => {
                if (units?.length) {
                    setFirstUnitNo(units[0].unit_no);
                    setFirstDeviceId((units[0] as { device_id?: string }).device_id ?? null);
                }
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        const now = getCurrentPeriodKey(period === 'live' ? 'monthly' : period);
        todayKey.current = now;
        if (period !== 'live') setPeriodKey(now);
    }, [period]);

    // Fetch historical trend data
    useEffect(() => {
        if (!firstUnitNo || period === 'live') {
            if (period === 'live') setLoading(false);
            return;
        }

        let cancelled = false;
        setLoading(true);

        const apiPeriod = period === 'daily' ? 'daily' : 'monthly';
        fetchApi(`/reporting/trends/${encodeURIComponent(firstUnitNo)}?period=${apiPeriod}`)
            .then(trends => {
                if (cancelled) return;
                const raw = (trends || []) as TrendResponse[];

                let mapped: TrendData[] = [];
                if (period === 'daily') {
                    const filtered = raw.filter(t => {
                        const d = new Date(t.bucket);
                        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                        return k === periodKey;
                    });
                    mapped = filtered.map(t => ({
                        name: new Date(t.bucket).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
                        electricity: Number(t.kwh || 0),
                        water: Number(t.waterM3 || t.water_m3 || 0),
                    }));
                } else if (period === 'monthly') {
                    const filtered = raw.filter(t => String(new Date(t.bucket).getFullYear()) === periodKey);
                    mapped = filtered.map(t => ({
                        name: new Date(t.bucket).toLocaleDateString('id-ID', { month: 'short' }),
                        electricity: Number(t.kwh || 0),
                        water: Number(t.waterM3 || t.water_m3 || 0),
                    }));
                } else if (period === 'yearly') {
                    const yearMap = new Map<string, { electricity: number; water: number }>();
                    raw.forEach(t => {
                        const year = String(new Date(t.bucket).getFullYear());
                        const e = yearMap.get(year) || { electricity: 0, water: 0 };
                        yearMap.set(year, {
                            electricity: e.electricity + Number(t.kwh || 0),
                            water: e.water + Number(t.waterM3 || t.water_m3 || 0),
                        });
                    });
                    mapped = [...yearMap.entries()]
                        .sort(([a], [b]) => Number(a) - Number(b))
                        .map(([year, vals]) => ({ name: year, ...vals }));
                }

                setData(mapped);

                if (period !== 'yearly') {
                    const allKeys = raw.map(t => {
                        const d = new Date(t.bucket);
                        return period === 'daily'
                            ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                            : String(d.getFullYear());
                    });
                    const unique = [...new Set(allKeys)];
                    const prevKey = offsetPeriodKey(periodKey, period === 'daily' ? 'daily' : 'monthly', -1);
                    const nextKey = offsetPeriodKey(periodKey, period === 'daily' ? 'daily' : 'monthly', 1);
                    setHasPrev(unique.includes(prevKey));
                    setHasNext(nextKey <= todayKey.current && unique.includes(nextKey));
                } else {
                    setHasPrev(false);
                    setHasNext(false);
                }
            })
            .catch(() => { if (!cancelled) { setData([]); setHasPrev(false); setHasNext(false); } })
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };
    }, [firstUnitNo, periodKey, period]);

    // MQTT live connection
    useEffect(() => {
        if (period !== 'live' || !firstDeviceId || !MQTT_CONFIG.brokerUrl) return;

        setIsConnected(false);
        setLiveElecData([]);
        setLiveWaterData([]);

        const client = mqtt.connect(MQTT_CONFIG.brokerUrl, {
            ...MQTT_CONFIG.options,
            clientId: `ta-dashboard-overview-${Math.random().toString(16).slice(2, 8)}`,
        });

        const topic = `device/${firstDeviceId}/data`;

        client.on('connect', () => {
            setIsConnected(true);
            client.subscribe(topic);
        });

        client.on('message', (msgTopic, message) => {
            if (msgTopic !== topic) return;
            const buf = new Uint8Array(message.buffer, message.byteOffset, message.byteLength);
            const decoded = decodeTelemetry(buf);
            if (!decoded) return;
            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            setLiveElecData(prev => [...prev.slice(-59), {
                time: timeStr,
                power: decoded.p ?? 0,
                voltage: decoded.v ?? 0,
                current: decoded.c ?? 0,
            }]);
            setLiveWaterData(prev => [...prev.slice(-59), {
                time: timeStr,
                flow: decoded.wf ?? 0,
            }]);
        });

        client.on('error', () => setIsConnected(false));

        return () => {
            client.end();
            setIsConnected(false);
        };
    }, [period, firstDeviceId]);

    const isLive = period === 'live';
    const activeLiveMetric = LIVE_METRICS.find(m => m.id === livePowerMetric)!;

    const liveChartData = utility === 'electricity'
        ? liveElecData.map(d => ({ time: d.time, value: d[livePowerMetric] }))
        : liveWaterData.map(d => ({ time: d.time, value: d.flow }));

    const liveUnit = utility === 'electricity' ? activeLiveMetric.unit : 'L/min';
    const liveColor = utility === 'electricity' ? activeLiveMetric.color : COLORS.water;
    const liveLabel = utility === 'electricity' ? activeLiveMetric.label : 'Flow Rate';

    const PERIOD_OPTIONS: { id: Period; label: string }[] = [
        { id: 'daily',   label: 'Daily' },
        { id: 'monthly', label: 'Monthly' },
        { id: 'yearly',  label: 'Yearly' },
        { id: 'live',    label: 'Live' },
    ];

    const color = isLive ? liveColor : COLORS[utility];
    const gradId = `grad-${utility}-${isLive ? livePowerMetric : 'hist'}`;

    return (
        <div className="rounded-lg bg-white dark:bg-gray-800 p-6 shadow-sm ring-1 ring-gray-900/5 dark:ring-gray-700">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        {isLive && (
                            <Radio className={`h-3.5 w-3.5 ${isConnected ? 'text-red-500 animate-pulse' : 'text-gray-400'}`} />
                        )}
                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                            {isLive ? (isConnected ? 'Live Data' : 'Connecting...') : 'Consumption Trends'}
                        </h3>
                    </div>
                    <div className="flex rounded-md overflow-hidden border border-gray-200 dark:border-gray-600 text-xs font-medium">
                        <button
                            onClick={() => setUtility('electricity')}
                            title="Electricity"
                            className={`flex items-center justify-center w-8 h-7 transition-colors ${utility === 'electricity' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                        >
                            <Zap className="h-3.5 w-3.5" />
                        </button>
                        <button
                            onClick={() => setUtility('water')}
                            title="Water"
                            className={`flex items-center justify-center w-8 h-7 border-l border-gray-200 dark:border-gray-600 transition-colors ${utility === 'water' ? 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                        >
                            <Droplets className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>

                <div className="flex flex-col gap-2">
                    <div className="flex rounded-md overflow-hidden border border-gray-200 dark:border-gray-600 text-xs font-medium">
                        {PERIOD_OPTIONS.map(({ id, label }) => (
                            <button
                                key={id}
                                onClick={() => setPeriod(id)}
                                className={`flex-1 px-2.5 py-1.5 transition-colors border-l first:border-l-0 border-gray-200 dark:border-gray-600 ${period === id ? 'bg-primary text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {(period === 'daily' || period === 'monthly') && (
                        <div className="flex items-center justify-center gap-0.5">
                            <button
                                onClick={() => setPeriodKey(k => offsetPeriodKey(k, period, -1))}
                                disabled={!hasPrev}
                                className="rounded p-0.5 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <span className="text-xs font-medium text-gray-700 dark:text-gray-300 min-w-[80px] text-center">
                                {periodLabel(periodKey, period)}
                            </span>
                            <button
                                onClick={() => setPeriodKey(k => offsetPeriodKey(k, period, 1))}
                                disabled={!hasNext}
                                className="rounded p-0.5 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Live sub-metric selector — electricity only */}
            {isLive && utility === 'electricity' && (
                <div className="flex gap-1 mb-4 p-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    {LIVE_METRICS.map(({ id, label }) => (
                        <button
                            key={id}
                            onClick={() => setLivePowerMetric(id)}
                            className={`flex-1 py-1.5 px-2 rounded-md text-xs font-semibold transition-colors ${
                                livePowerMetric === id
                                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            )}

            {/* Historical label */}
            {!isLive && (
                <div className="mb-1 text-xs text-gray-400 dark:text-gray-500">
                    {LABELS[utility].title} ({LABELS[utility].unit})
                </div>
            )}

            {/* Live label */}
            {isLive && (
                <div className="mb-1 text-xs text-gray-400 dark:text-gray-500">
                    {liveLabel} ({liveUnit})
                </div>
            )}

            {/* Historical loading / empty */}
            {!isLive && loading && (
                <div className="h-72 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
                    Loading...
                </div>
            )}
            {!isLive && !loading && data.length === 0 && (
                <div className="h-72 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
                    No data for this period.
                </div>
            )}

            {/* Live waiting */}
            {isLive && liveChartData.length === 0 && (
                <div className="h-72 flex flex-col items-center justify-center gap-2 text-sm text-gray-400 dark:text-gray-500">
                    {isConnected
                        ? <span>Waiting for device data...</span>
                        : <span>Connecting to live feed...</span>}
                </div>
            )}

            {/* Historical chart */}
            {!isLive && !loading && data.length > 0 && (
                <div className="w-full">
                    <div className="mb-3 flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                            {data.reduce((s, d) => s + (d[utility] as number), 0).toFixed(2)}
                        </span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">{LABELS[utility].unit} total</span>
                    </div>
                    <ResponsiveContainer width="100%" height={288}>
                        <AreaChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: tickColor, fontSize: 11 }} dy={6} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: tickColor, fontSize: 11 }} width={40} />
                            <Tooltip
                                contentStyle={tooltipStyle}
                                cursor={{ stroke: COLORS[utility], strokeWidth: 1, strokeDasharray: '3 3' }}
                                formatter={(val: number | string | readonly (number | string)[] | undefined) => [
                                    `${Number(val ?? 0).toFixed(2)} ${LABELS[utility].unit}`,
                                    LABELS[utility].title
                                ] as [string, string]}
                            />
                            <Area
                                type="monotone"
                                dataKey={utility}
                                stroke={color}
                                strokeWidth={2}
                                fillOpacity={1}
                                fill={`url(#${gradId})`}
                                dot={false}
                                activeDot={{ r: 4, fill: color }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Live chart */}
            {isLive && liveChartData.length > 0 && (
                <div className="w-full">
                    <div className="mb-3 flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                            {liveChartData.length > 0
                                ? liveChartData[liveChartData.length - 1].value.toFixed(utility === 'electricity' && livePowerMetric === 'current' ? 3 : 1)
                                : '—'}
                        </span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">{liveUnit} now</span>
                    </div>
                    <ResponsiveContainer width="100%" height={288}>
                        <AreaChart data={liveChartData} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={liveColor} stopOpacity={0.25} />
                                    <stop offset="95%" stopColor={liveColor} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                            <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: tickColor, fontSize: 11 }} dy={6} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: tickColor, fontSize: 11 }} width={40} />
                            <Tooltip
                                contentStyle={tooltipStyle}
                                formatter={(val: number | string | readonly (number | string)[] | undefined) => [
                                    `${Number(val ?? 0).toFixed(utility === 'electricity' && livePowerMetric === 'current' ? 3 : 1)} ${liveUnit}`,
                                    liveLabel
                                ] as [string, string]}
                            />
                            <Area
                                type="monotone"
                                dataKey="value"
                                stroke={liveColor}
                                strokeWidth={2}
                                fillOpacity={1}
                                fill={`url(#${gradId})`}
                                dot={false}
                                activeDot={false}
                                isAnimationActive={false}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
}
