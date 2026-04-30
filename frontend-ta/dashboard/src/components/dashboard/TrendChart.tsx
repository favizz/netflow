import { useEffect, useState, useRef } from "react";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { ChevronLeft, ChevronRight, Zap, Droplets } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { useIsDark } from "@/lib/useIsDark";

type Utility = 'electricity' | 'water';
type Period = 'monthly' | 'yearly';

const COLORS: Record<Utility, string> = {
    electricity: '#f59e0b',
    water: '#06b6d4',
};

const LABELS: Record<Utility, { title: string; unit: string }> = {
    electricity: { title: 'Electricity', unit: 'kWh' },
    water: { title: 'Water', unit: 'm³' },
};

function getCurrentPeriodKey(period: Period): string {
    const now = new Date();
    if (period === 'monthly') return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return String(now.getFullYear());
}

function offsetPeriodKey(key: string, period: Period, delta: number): string {
    if (period === 'monthly') {
        const [y, m] = key.split('-').map(Number);
        const date = new Date(y, m - 1 + delta);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
    return String(Number(key) + delta);
}

function periodLabel(key: string, period: Period): string {
    if (period === 'monthly') {
        const [y, m] = key.split('-').map(Number);
        return new Date(y, m - 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    }
    return `Year ${key}`;
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

    useEffect(() => {
        const now = getCurrentPeriodKey(period);
        todayKey.current = now;
        setPeriodKey(now);
    }, [period]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);

        fetchApi('/unit')
            .then(async (units: { unit_no: string }[]) => {
                if (cancelled) return;
                if (!units || units.length === 0) { setData([]); setHasPrev(false); setHasNext(false); return; }

                const firstUnit = units[0].unit_no;
                const apiPeriod = period === 'monthly' ? 'daily' : 'monthly';
                const trends = await fetchApi(`/reporting/trends/${encodeURIComponent(firstUnit)}?period=${apiPeriod}`);
                if (cancelled) return;

                const raw = (trends || []) as TrendResponse[];

                const filtered = raw.filter(t => {
                    const d = new Date(t.bucket);
                    if (period === 'monthly') {
                        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                        return k === periodKey;
                    }
                    return String(d.getFullYear()) === periodKey;
                });

                const mapped: TrendData[] = filtered.map(t => ({
                    name: period === 'monthly'
                        ? new Date(t.bucket).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
                        : new Date(t.bucket).toLocaleDateString('id-ID', { month: 'short' }),
                    electricity: Number(t.kwh || 0),
                    water: Number(t.waterM3 || t.water_m3 || 0),
                }));

                setData(mapped);

                const allKeys = raw.map(t => {
                    const d = new Date(t.bucket);
                    return period === 'monthly'
                        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                        : String(d.getFullYear());
                });
                const unique = [...new Set(allKeys)];

                const prevKey = offsetPeriodKey(periodKey, period, -1);
                const nextKey = offsetPeriodKey(periodKey, period, 1);
                setHasPrev(unique.includes(prevKey));
                setHasNext(nextKey <= todayKey.current && unique.includes(nextKey));
            })
            .catch(() => { if (!cancelled) { setData([]); setHasPrev(false); setHasNext(false); } })
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };
    }, [periodKey, period]);

    const color = COLORS[utility];
    const gradId = `grad-${utility}`;

    return (
        <div className="rounded-lg bg-white dark:bg-gray-800 p-6 shadow-sm ring-1 ring-gray-900/5 dark:ring-gray-700">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Consumption Trends</h3>
                    <div className="flex rounded-md overflow-hidden border border-gray-200 dark:border-gray-600 text-xs font-medium">
                        <button
                            onClick={() => setUtility('electricity')}
                            className={`flex items-center gap-1 px-3 py-1.5 transition-colors ${utility === 'electricity' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                        >
                            <Zap className="h-3.5 w-3.5" /> Electricity
                        </button>
                        <button
                            onClick={() => setUtility('water')}
                            className={`flex items-center gap-1 px-3 py-1.5 border-l border-gray-200 dark:border-gray-600 transition-colors ${utility === 'water' ? 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                        >
                            <Droplets className="h-3.5 w-3.5" /> Water
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex rounded-md overflow-hidden border border-gray-200 dark:border-gray-600 text-xs font-medium">
                        <button
                            onClick={() => setPeriod('monthly')}
                            className={`px-3 py-1.5 transition-colors ${period === 'monthly' ? 'bg-primary text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                        >
                            Monthly
                        </button>
                        <button
                            onClick={() => setPeriod('yearly')}
                            className={`px-3 py-1.5 border-l border-gray-200 dark:border-gray-600 transition-colors ${period === 'yearly' ? 'bg-primary text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                        >
                            Yearly
                        </button>
                    </div>

                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setPeriodKey(k => offsetPeriodKey(k, period, -1))}
                            disabled={!hasPrev}
                            className="rounded p-1 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300 min-w-[110px] text-center">
                            {periodLabel(periodKey, period)}
                        </span>
                        <button
                            onClick={() => setPeriodKey(k => offsetPeriodKey(k, period, 1))}
                            disabled={!hasNext}
                            className="rounded p-1 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="mb-1 text-xs text-gray-400 dark:text-gray-500">
                {LABELS[utility].title} ({LABELS[utility].unit})
            </div>

            {loading && (
                <div className="h-72 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
                    Loading...
                </div>
            )}
            {!loading && data.length === 0 && (
                <div className="h-72 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
                    No data for this period.
                </div>
            )}
            {!loading && data.length > 0 && (
                <div className="h-72 w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
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
                                formatter={(val: number | string | readonly (number | string)[] | undefined) => [
                                    `${Number(Array.isArray(val) ? val[0] : val ?? 0).toFixed(2)} ${LABELS[utility].unit}`,
                                    LABELS[utility].title
                                ]}
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
        </div>
    );
}
