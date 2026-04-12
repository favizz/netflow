"use client";

import { useEffect, useState } from "react";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from "recharts";
import { fetchApi } from "@/lib/api";

export function TrendChart() {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Aggregate daily trends across all units by fetching all units
        // then querying reporting for the first unit as a system-wide sample
        fetchApi('/unit')
            .then(async (units: any[]) => {
                if (!units || units.length === 0) { setLoading(false); return; }
                // Use first unit's daily trend as a representative trend view
                const firstUnit = units[0].unit_no;
                const trends = await fetchApi(`/reporting/trends/${encodeURIComponent(firstUnit)}?period=daily`);
                const mapped = (trends || []).map((t: any) => ({
                    name: new Date(t.bucket).toLocaleDateString('id-ID', { weekday: 'short' }),
                    electricity: parseFloat(t.kwh || 0),
                    water: parseFloat(t.waterM3 || t.water_m3 || 0),
                }));
                setData(mapped);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-900/5">
            <h3 className="mb-4 text-base font-semibold text-gray-900">Consumption Trends</h3>
            {loading && <p className="text-sm text-gray-400 h-80 flex items-center justify-center">Loading trends...</p>}
            {!loading && data.length === 0 && (
                <p className="text-sm text-gray-400 h-80 flex items-center justify-center">No trend data available yet.</p>
            )}
            {!loading && data.length > 0 && (
                <div className="h-80 w-full min-w-0 min-h-0">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                        <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorElec" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#5E81F4" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="#5E81F4" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorWater" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} dy={10} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                            <Legend wrapperStyle={{ paddingTop: '12px', fontSize: '12px' }} />
                            <Area type="monotone" dataKey="electricity" stroke="#5E81F4" fillOpacity={1} fill="url(#colorElec)" name="Electricity (kWh)" />
                            <Area type="monotone" dataKey="water" stroke="#06b6d4" fillOpacity={1} fill="url(#colorWater)" name="Water (m³)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
}
