"use client";

import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from "recharts";

const data = [
    { name: "Mon", electricity: 4000, water: 240 },
    { name: "Tue", electricity: 3000, water: 139 },
    { name: "Wed", electricity: 2000, water: 980 },
    { name: "Thu", electricity: 2780, water: 390 },
    { name: "Fri", electricity: 1890, water: 480 },
    { name: "Sat", electricity: 2390, water: 380 },
    { name: "Sun", electricity: 3490, water: 430 },
];

export function TrendChart() {
    return (
        <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-900/5">
            <h3 className="mb-4 text-base font-semibold text-gray-900">Consumption Trends</h3>
            <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                        data={data}
                        margin={{
                            top: 10,
                            right: 30,
                            left: 0,
                            bottom: 0,
                        }}
                    >
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
                        <XAxis
                            dataKey="name"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#6B7280', fontSize: 12 }}
                            dy={10}
                        />
                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#6B7280', fontSize: 12 }}
                        />
                        <Tooltip
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        />
                        <Area
                            type="monotone"
                            dataKey="electricity"
                            stroke="#5E81F4"
                            fillOpacity={1}
                            fill="url(#colorElec)"
                            name="Electricity (kWh)"
                        />
                        <Area
                            type="monotone"
                            dataKey="water"
                            stroke="#06b6d4"
                            fillOpacity={1}
                            fill="url(#colorWater)"
                            name="Water (m³)"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
