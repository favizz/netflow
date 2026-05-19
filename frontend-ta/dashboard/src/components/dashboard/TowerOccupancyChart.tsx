"use client";

import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from "recharts";

const data = [
    { day: "1", TowerA: 85, TowerB: 92, TowerC: 78, TowerD: 88 },
    { day: "5", TowerA: 86, TowerB: 93, TowerC: 79, TowerD: 87 },
    { day: "10", TowerA: 88, TowerB: 94, TowerC: 82, TowerD: 85 },
    { day: "15", TowerA: 87, TowerB: 91, TowerC: 85, TowerD: 86 },
    { day: "20", TowerA: 89, TowerB: 92, TowerC: 88, TowerD: 90 },
    { day: "25", TowerA: 91, TowerB: 95, TowerC: 90, TowerD: 92 },
    { day: "30", TowerA: 92, TowerB: 96, TowerC: 91, TowerD: 93 },
];

export function TowerOccupancyChart() {
    return (
        <div className="mt-6 rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-900/5">
            <div className="mb-4">
                <h3 className="text-lg font-bold text-gray-900">Tower Occupancy Rate</h3>
                <p className="text-sm text-gray-500">Active sensor trends (Past 30 Days)</p>
            </div>

            <div className="w-full">
                <ResponsiveContainer width="100%" height={300}>
                    <AreaChart
                        data={data}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                        <defs>
                            <linearGradient id="colorTowerA" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorTowerB" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorTowerC" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorTowerD" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis
                            dataKey="day"
                            tick={{ fill: '#6b7280', fontSize: 12 }}
                            tickLine={false}
                            axisLine={false}
                            label={{ value: 'Day of Month', position: 'insideBottom', offset: -5, fill: '#9ca3af', fontSize: 10 }}
                        />
                        <YAxis
                            tick={{ fill: '#6b7280', fontSize: 12 }}
                            tickLine={false}
                            axisLine={false}
                            domain={[60, 100]}
                            unit="%"
                        />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            itemStyle={{ fontSize: '12px', fontWeight: 500 }}
                        />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />

                        <Area type="monotone" dataKey="TowerA" stroke="#3b82f6" fillOpacity={1} fill="url(#colorTowerA)" strokeWidth={2} name="Tower A" />
                        <Area type="monotone" dataKey="TowerB" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorTowerB)" strokeWidth={2} name="Tower B" />
                        <Area type="monotone" dataKey="TowerC" stroke="#10b981" fillOpacity={1} fill="url(#colorTowerC)" strokeWidth={2} name="Tower C" />
                        <Area type="monotone" dataKey="TowerD" stroke="#f59e0b" fillOpacity={1} fill="url(#colorTowerD)" strokeWidth={2} name="Tower D" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
