import { Activity, Droplets, Zap, AlertTriangle } from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { RecentAlerts } from "@/components/dashboard/RecentAlerts";
import { TowerCard } from "@/components/dashboard/TowerCard";
import { TowerComparisonChart } from "@/components/dashboard/TowerComparisonChart";
import { TowerOccupancyChart } from "@/components/dashboard/TowerOccupancyChart";

export default function DashboardPage() {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900">Dashboard Overview</h1>
                <div className="text-sm text-gray-500">Last updated: Just now</div>
            </div>

            {/* Stats Grid */}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title="Total Power Usage"
                    value="45,231 kWh"
                    icon={Zap}
                    trend="↑ 12.5%"
                    trendLabel="from last month"
                    trendDirection="up"
                    iconBgClass="bg-blue-50"
                    iconColorClass="text-primary"
                />
                <StatCard
                    title="Total Water Usage"
                    value="1,205 m³"
                    icon={Droplets}
                    trend="↑ 8.2%"
                    trendLabel="from last month"
                    trendDirection="up"
                    iconBgClass="bg-cyan-50"
                    iconColorClass="text-cyan-600"
                />
                <StatCard
                    title="Online Devices"
                    value="2,412"
                    icon={Activity}
                    trend="98.7%"
                    trendLabel="uptime"
                    trendDirection="neutral"
                    iconBgClass="bg-green-50"
                    iconColorClass="text-green-600"
                />
                <StatCard
                    title="Active Alerts"
                    value="32"
                    icon={AlertTriangle}
                    trend="Needs attention"
                    trendDirection="down"
                    iconBgClass="bg-red-50"
                    iconColorClass="text-red-600"
                    valueColorClass="text-red-600"
                />
            </div>

            {/* Charts & Alerts */}
            <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2">
                    <TrendChart />
                </div>
                <div>
                    <RecentAlerts />
                </div>
            </div>

            {/* Tower Distribution Analytics */}
            <div>
                <h2 className="mb-4 text-lg font-bold text-gray-900">Tower Distribution Analytics</h2>
                <div className="grid gap-6 lg:grid-cols-3">
                    {/* Tower Cards Grid */}
                    <div className="lg:col-span-2 grid gap-6 sm:grid-cols-2">
                        <TowerCard
                            name="Tower A"
                            totalDevices={620}
                            onlineDevices={610}
                            anomalies={2}
                        />
                        <TowerCard
                            name="Tower B"
                            totalDevices={600}
                            onlineDevices={580}
                            anomalies={5}
                        />
                        <TowerCard
                            name="Tower C"
                            totalDevices={650}
                            onlineDevices={645}
                            anomalies={0}
                        />
                        <TowerCard
                            name="Tower D"
                            totalDevices={574}
                            onlineDevices={500}
                            anomalies={12}
                        />
                    </div>

                    {/* Comparison & Occupancy */}
                    <div className="space-y-6">
                        <TowerComparisonChart />
                        <TowerOccupancyChart />
                    </div>
                </div>
            </div>
        </div>
    );
}
