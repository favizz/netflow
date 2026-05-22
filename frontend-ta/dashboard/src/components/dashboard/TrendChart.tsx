import { useEffect, useState, useRef } from "react";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { ChevronLeft, ChevronRight, Zap, Droplets } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { useIsDark } from "@/lib/useIsDark";

type Utility = 'electricity' | 'water';
type Period = 'daily' | 'monthly' | 'yearly';

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
    if (period === 'daily') return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (period === 'monthly') return String(now.getFullYear());
    return 'all';
}

function offsetPeriodKey(key: string, period: Period, delta: number): string {
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
        return new Date(y, m - 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    }
    if (period === 'monthly') return `Tahun ${key}`;
    return 'All Time';
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
                const apiPeriod = period === 'daily' ? 'daily' : 'monthly';
                const trends = await fetchApi(`/reporting/trends/${encodeURIComponent(firstUnit)}?period=${apiPeriod}`);
                if (cancelled) return;

                const raw = (trends || []) as TrendResponse[];

                let mapped: TrendData[] = [];
                if (period === 'daily') {
                    // Show last 30 days filtered by periodKey (YYYY-MM)
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
                    // Show months of the year filtered by periodKey (YYYY)
                    const filtered = raw.filter(t => String(new Date(t.bucket).getFullYear()) === periodKey);
                    mapped = filtered.map(t => ({
                        name: new Date(t.bucket).toLocaleDateString('id-ID', { month: 'short' }),
                        electricity: Number(t.kwh || 0),
                        water: Number(t.waterM3 || t.water_m3 || 0),
                    }));
                } else if (period === 'yearly') {
                    // Aggregate monthly data into years
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
                    const prevKey = offsetPeriodKey(periodKey, period === 'daily' ? 'monthly' : 'yearly', -1);
                    const nextKey = offsetPeriodKey(periodKey, period === 'daily' ? 'monthly' : 'yearly', 1);
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
    }, [periodKey, period]);

    const color = COLORS[utility];
    const gradId = `grad-${utility}`;

    const PERIOD_OPTIONS: { id: Period; label: string }[] = [
        { id: 'daily',   label: 'Daily' },
        { id: 'monthly', label: 'Monthly' },
        { id: 'yearly',  label: 'Yearly' },
    ];

    return (
        <div className="rounded-lg bg-white dark:bg-gray-800 p-6 shadow-sm ring-1 ring-gray-900/5 dark:ring-gray-700">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Consumption Trends</h3>
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

                <div className="flex items-center gap-1">
                    <div className="flex rounded-md overflow-hidden border border-gray-200 dark:border-gray-600 text-xs font-medium">
                        {PERIOD_OPTIONS.map(({ id, label }) => (
                            <button
                                key={id}
                                onClick={() => setPeriod(id)}
                                className={`px-2.5 py-1.5 transition-colors border-l first:border-l-0 border-gray-200 dark:border-gray-600 ${period === id ? 'bg-primary text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {period !== 'daily' && (
                        <div className="flex items-center">
                            <button
                                onClick={() => setPeriodKey(k => offsetPeriodKey(k, period, -1))}
                                disabled={!hasPrev}
                                className="rounded p-1 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <span className="text-xs font-medium text-gray-700 dark:text-gray-300 min-w-[100px] text-center">
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
                    )}
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
                <div className="w-full">
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
        </div>
    );
}
