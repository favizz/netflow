"use client";

import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from "recharts";

const data = [
    { name: "Tower A", electricity: 12500, water: 450 },
    { name: "Tower B", electricity: 10200, water: 380 },
    { name: "Tower C", electricity: 14800, water: 520 },
    { name: "Tower D", electricity: 8900, water: 290 },
];

export function TowerComparisonChart() {
    return (
        <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-900/5">
            <h3 className="mb-4 text-base font-semibold text-gray-900">Tower Benchmarking</h3>
            <div className="w-full">
                <ResponsiveContainer width="100%" height={320}>
                    <BarChart
                        data={data}
                        margin={{
                            top: 20,
                            right: 30,
                            left: 20,
                            bottom: 5,
                        }}
                    >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} />
                        <YAxis yAxisId="left" orientation="left" stroke="#5E81F4" axisLine={false} tickLine={false} fontSize={12} />
                        <YAxis yAxisId="right" orientation="right" stroke="#06b6d4" axisLine={false} tickLine={false} fontSize={12} />
                        <Tooltip
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            cursor={{ fill: '#F3F4F6' }}
                        />
                        <Legend wrapperStyle={{ paddingTop: '20px' }} />
                        <Bar yAxisId="left" dataKey="electricity" name="Electricity (kWh)" fill="#5E81F4" radius={[4, 4, 0, 0]} barSize={30} />
                        <Bar yAxisId="right" dataKey="water" name="Water (m³)" fill="#06b6d4" radius={[4, 4, 0, 0]} barSize={30} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
