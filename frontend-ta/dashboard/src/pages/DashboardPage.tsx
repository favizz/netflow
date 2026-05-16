import { useState, useEffect } from "react";
import { Activity, Droplets, Zap, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { API_BASE_URL } from "@/lib/constants";
import { TrendChart } from "@/components/dashboard/TrendChart";

interface StatRowItem {
    icon: React.ReactNode;
    label: string;
    value: string;
    sub?: string;
}

function StatsRow({ items }: { items: StatRowItem[] }) {
    return (
        <div className="rounded-lg bg-white dark:bg-gray-900 shadow-sm ring-1 ring-gray-900/5 dark:ring-gray-700 divide-y divide-gray-100 dark:divide-gray-700 sm:divide-y-0 sm:divide-x sm:flex">
            {items.map((item, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3 flex-1 min-w-0">
                    <div className="shrink-0">{item.icon}</div>
                    <div className="min-w-0 flex-1">
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{item.label}</p>
                        <p className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-tight truncate">{item.value}</p>
                        {item.sub && <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{item.sub}</p>}
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function DashboardPage() {
    const [stats, setStats] = useState({
        totalPower: 0,
        totalWater: 0,
        onlineDevices: 0,
        totalDevices: 0,
        loaded: false,
    });
    const [health, setHealth] = useState<'healthy' | 'degraded' | 'critical' | null>(null);

    useEffect(() => {
        Promise.all([
            fetchApi('/unit').catch(() => []),
            fetchApi('/unit/connectivity').catch(() => ({})),
            fetch(`${API_BASE_URL}/health`).then(r => r.json()).catch(() => null),
        ]).then(([units, conn, healthData]) => {
            let pPower = 0;
            let pWater = 0;
            (units || []).forEach((u: { last_energy_reading?: number; last_water_reading?: number }) => {
                pPower += Number(u.last_energy_reading || 0);
                pWater += Number(u.last_water_reading || 0);
            });
            setStats({
                totalPower: pPower,
                totalWater: pWater,
                onlineDevices: conn.onlineUnits || 0,
                totalDevices: conn.totalUnits || (units || []).length,
                loaded: true,
            });
            if (healthData && typeof healthData === 'object') {
                setHealth((healthData as { overall?: 'healthy' | 'degraded' | 'critical' }).overall ?? null);
            }
        });
    }, []);

    const healthIcon =
        health === 'critical' ? <ShieldX className="h-5 w-5 text-red-500" /> :
        health === 'degraded' ? <ShieldAlert className="h-5 w-5 text-amber-500" /> :
        <ShieldCheck className="h-5 w-5 text-green-500" />;

    const healthLabel =
        health === 'critical' ? 'Critical' :
        health === 'degraded' ? 'Degraded' :
        health === 'healthy'  ? 'Healthy'  : '—';

    const healthSub =
        health === 'critical' ? 'Service outage detected' :
        health === 'degraded' ? 'Some services degraded' :
        'All services operational';

    const statItems: StatRowItem[] = [
        {
            icon: <Zap className="h-5 w-5 text-primary" />,
            label: "Total Energy",
            value: stats.loaded ? `${stats.totalPower.toLocaleString(undefined, { maximumFractionDigits: 1 })} kWh` : "—",
            sub: "Cumulative, all units",
        },
        {
            icon: <Droplets className="h-5 w-5 text-cyan-500" />,
            label: "Total Water",
            value: stats.loaded ? `${stats.totalWater.toLocaleString(undefined, { maximumFractionDigits: 1 })} m³` : "—",
            sub: "Cumulative, all units",
        },
        {
            icon: <Activity className="h-5 w-5 text-green-500" />,
            label: "Online Devices",
            value: stats.loaded ? `${stats.onlineDevices} / ${stats.totalDevices}` : "—",
            sub: "Live connectivity",
        },
        {
            icon: healthIcon,
            label: "System Health",
            value: healthLabel,
            sub: healthSub,
        },
    ];

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Overview</h1>
            <StatsRow items={statItems} />
            <TrendChart />
        </div>
    );
}
