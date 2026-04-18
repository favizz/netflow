import { useState, useEffect } from "react";
import { Activity, Droplets, Zap, AlertTriangle } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { StatCard } from "@/components/dashboard/StatCard";
import { TrendChart } from "@/components/dashboard/TrendChart";

export default function DashboardPage() {
    const [stats, setStats] = useState({
        totalPower: 0,
        totalWater: 0,
        onlineDevices: 0,
        totalDevices: 0,
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
                totalDevices: conn.totalUnits || (units || []).length,
                alerts: pAlerts,
                loaded: true
            });
        });
    }, []);

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Overview</h1>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title="Total Energy"
                    value={stats.loaded ? `${stats.totalPower.toLocaleString(undefined, { maximumFractionDigits: 1 })} kWh` : "—"}
                    icon={Zap}
                    trend="Cumulative from all units"
                    trendDirection="neutral"
                    iconBgClass="bg-primary/10 dark:bg-primary/20"
                    iconColorClass="text-primary"
                />
                <StatCard
                    title="Total Water"
                    value={stats.loaded ? `${stats.totalWater.toLocaleString(undefined, { maximumFractionDigits: 1 })} m³` : "—"}
                    icon={Droplets}
                    trend="Cumulative from all units"
                    trendDirection="neutral"
                    iconBgClass="bg-cyan-50 dark:bg-cyan-900/30"
                    iconColorClass="text-cyan-600 dark:text-cyan-400"
                />
                <StatCard
                    title="Online Devices"
                    value={stats.loaded ? `${stats.onlineDevices} / ${stats.totalDevices}` : "—"}
                    icon={Activity}
                    trend="System connectivity"
                    trendDirection="neutral"
                    iconBgClass="bg-green-50 dark:bg-green-900/30"
                    iconColorClass="text-green-600 dark:text-green-400"
                />
                <StatCard
                    title="Active Alerts"
                    value={stats.loaded ? String(stats.alerts) : "—"}
                    icon={AlertTriangle}
                    trend={stats.alerts > 0 ? "Needs attention" : "All clear"}
                    trendDirection={stats.alerts > 0 ? "down" : "neutral"}
                    iconBgClass={stats.alerts > 0 ? "bg-red-50 dark:bg-red-900/30" : "bg-green-50 dark:bg-green-900/30"}
                    iconColorClass={stats.alerts > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}
                    valueColorClass={stats.alerts > 0 ? "text-red-600 dark:text-red-400" : "text-gray-900"}
                />
            </div>

            <TrendChart />
        </div>
    );
}
