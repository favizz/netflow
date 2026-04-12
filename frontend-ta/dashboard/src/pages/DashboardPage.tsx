import { useState, useEffect } from "react";
import { Activity, Droplets, Zap, AlertTriangle } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { StatCard } from "@/components/dashboard/StatCard";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { RecentAlerts } from "@/components/dashboard/RecentAlerts";
import { TowerCard } from "@/components/dashboard/TowerCard";
import { TowerComparisonChart } from "@/components/dashboard/TowerComparisonChart";
import { TowerOccupancyChart } from "@/components/dashboard/TowerOccupancyChart";

export default function DashboardPage() {
    const [stats, setStats] = useState({
        totalPower: 0,
        totalWater: 0,
        onlineDevices: 0,
        alerts: 0,
        loaded: false
    });

    useEffect(() => {
        Promise.all([
            fetchApi('/unit').catch(() => []),
            fetchApi('/unit/connectivity').catch(() => ({}))
        ]).then(([units, conn]) => {
            let pPower = 0;
            let pWater = 0;
            let pAlerts = 0;
            
            (units || []).forEach((u: any) => {
                pPower += Number(u.last_energy_reading || 0);
                pWater += Number(u.last_water_reading || 0);
                if (Number(u.balance) <= 20000 || !u.relay_status) pAlerts++;
            });

            setStats({
                totalPower: pPower,
                totalWater: pWater,
                onlineDevices: conn.onlineUnits || 0,
                alerts: pAlerts,
                loaded: true
            });
        });
    }, []);

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
                    value={stats.loaded ? `${stats.totalPower.toLocaleString(undefined, { maximumFractionDigits: 1 })} kWh` : "Loading..."}
                    icon={Zap}
                    trend="Live Data"
                    trendLabel="aggregated"
                    trendDirection="neutral"
                    iconBgClass="bg-blue-50"
                    iconColorClass="text-primary"
                />
                <StatCard
                    title="Total Water Usage"
                    value={stats.loaded ? `${stats.totalWater.toLocaleString(undefined, { maximumFractionDigits: 1 })} m³` : "Loading..."}
                    icon={Droplets}
                    trend="Live Data"
                    trendLabel="aggregated"
                    trendDirection="neutral"
                    iconBgClass="bg-cyan-50"
                    iconColorClass="text-cyan-600"
                />
                <StatCard
                    title="Online Devices"
                    value={stats.loaded ? String(stats.onlineDevices) : "Loading..."}
                    icon={Activity}
                    trend="System connectivity"
                    trendLabel="status"
                    trendDirection="neutral"
                    iconBgClass="bg-green-50"
                    iconColorClass="text-green-600"
                />
                <StatCard
                    title="Active Alerts"
                    value={stats.loaded ? String(stats.alerts) : "Loading..."}
                    icon={AlertTriangle}
                    trend={stats.alerts > 0 ? "Needs attention" : "All clear"}
                    trendDirection={stats.alerts > 0 ? "down" : "neutral"}
                    iconBgClass={stats.alerts > 0 ? "bg-red-50" : "bg-green-50"}
                    iconColorClass={stats.alerts > 0 ? "text-red-600" : "text-green-600"}
                    valueColorClass={stats.alerts > 0 ? "text-red-600" : "text-gray-900"}
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
