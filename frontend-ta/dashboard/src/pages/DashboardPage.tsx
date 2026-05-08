import { useState, useEffect, useCallback } from "react";
import { Activity, Droplets, Zap, AlertTriangle, RefreshCw } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { API_BASE_URL } from "@/lib/constants";
import { StatCard } from "@/components/dashboard/StatCard";
import { TrendChart } from "@/components/dashboard/TrendChart";

type ServiceStatus = 'ok' | 'error' | 'configured' | 'not_configured';

interface ServiceHealth {
    status: ServiceStatus;
    latencyMs: number | null;
}

interface HealthReport {
    checkedAt: string;
    overall: 'healthy' | 'degraded' | 'critical';
    services: Record<string, ServiceHealth>;
}

// Order determines display order in the panel
const SERVICE_LABELS: [string, string][] = [
    ['database', 'Database'],
    ['redis',    'Redis'],
    ['mqtt',     'MQTT Broker'],
    ['ml',       'ML Service'],
    ['smtp',     'SMTP'],
];

const STATUS_DOT: Record<ServiceStatus, string> = {
    ok:             'bg-green-500',
    configured:     'bg-green-500',
    error:          'bg-red-500',
    not_configured: 'bg-amber-400',
};

const STATUS_BADGE: Record<ServiceStatus, string> = {
    ok:             'text-green-700 dark:text-green-400',
    configured:     'text-green-700 dark:text-green-400',
    error:          'text-red-700 dark:text-red-400',
    not_configured: 'text-amber-600 dark:text-amber-400',
};

const STATUS_TEXT: Record<ServiceStatus, string> = {
    ok:             'OK',
    configured:     'Configured',
    error:          'Unavailable',
    not_configured: 'Not configured',
};

const OVERALL_STYLE: Record<string, string> = {
    healthy:  'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 ring-green-600/20',
    degraded: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 ring-amber-600/20',
    critical: 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 ring-red-600/20',
};

function HealthPanel() {
    const [health, setHealth] = useState<HealthReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [checkedAgo, setCheckedAgo] = useState('');

    const refresh = useCallback(() => {
        setLoading(true);
        // Use plain fetch - /health is public (no auth) and may return 503 when degraded.
        // fetchApi would throw on non-2xx, so we'd lose the body. Read it unconditionally.
        fetch(`${API_BASE_URL}/health`)
            .then(res => res.json())
            .then((data: unknown) => {
                if (data && typeof data === 'object') {
                    const d = data as Record<string, unknown>;
                    const checks = (d.checks as Record<string, { ok: boolean; latencyMs?: number }>) ?? {};
                    const services: Record<string, ServiceHealth> = {};
                    for (const [key, val] of Object.entries(checks)) {
                        services[key] = {
                            status: key === 'smtp'
                                ? (val.ok ? 'configured' : 'not_configured')
                                : (val.ok ? 'ok' : 'error'),
                            latencyMs: val.latencyMs ?? null,
                        };
                    }
                    setHealth({
                        checkedAt: (d.checkedAt as string) ?? new Date().toISOString(),
                        overall: (d.overall as HealthReport['overall']) ?? 'healthy',
                        services,
                    });
                }
            })
            .catch(() => setHealth(null))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        refresh();
        const poll = setInterval(refresh, 30_000);
        return () => clearInterval(poll);
    }, [refresh]);

    useEffect(() => {
        if (!health?.checkedAt) return;
        const update = () => {
            const diffSec = Math.round((Date.now() - new Date(health.checkedAt).getTime()) / 1000);
            setCheckedAgo(diffSec < 5 ? 'just now' : `${diffSec}s ago`);
        };
        update();
        const t = setInterval(update, 5000);
        return () => clearInterval(t);
    }, [health?.checkedAt]);

    const services = health ? SERVICE_LABELS : [];

    return (
        <div className="rounded-lg bg-white dark:bg-gray-900 shadow-sm ring-1 ring-gray-900/5 dark:ring-gray-700 px-5 py-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">System Health</span>
                    {health && (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset capitalize ${OVERALL_STYLE[health.overall]}`}>
                            {health.overall}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {checkedAgo && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">checked {checkedAgo}</span>
                    )}
                    <button
                        onClick={refresh}
                        disabled={loading}
                        className="rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-40 transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {loading && !health && Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-md bg-gray-50 dark:bg-gray-800 px-3 py-2">
                        <div className="h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600 animate-pulse" />
                        <div className="h-3 w-16 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
                    </div>
                ))}
                {services.map(([key, label]: [string, string]) => {
                    const svc = health!.services[key];
                    if (!svc) return null;
                    return (
                        <div key={key} className="flex flex-col gap-0.5 rounded-md bg-gray-50 dark:bg-gray-800 px-3 py-2">
                            <div className="flex items-center gap-1.5">
                                <span className={`h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[svc.status]}`} />
                                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{label}</span>
                            </div>
                            <div className="pl-3.5 flex items-center gap-1">
                                <span className={`text-xs ${STATUS_BADGE[svc.status]}`}>
                                    {STATUS_TEXT[svc.status]}
                                </span>
                                {svc.latencyMs !== null && (
                                    <span className="text-[10px] text-gray-400 dark:text-gray-500">{svc.latencyMs}ms</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

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

            (units || []).forEach((u: { last_energy_reading?: number; last_water_reading?: number; balance?: number | string; relay_status?: boolean }) => {
                pPower += Number(u.last_energy_reading || 0);
                pWater += Number(u.last_water_reading || 0);
                if (Number(u.balance) <= 20000 || u.relay_status === false) pAlerts++;
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
                    value={stats.loaded ? `${stats.totalPower.toLocaleString(undefined, { maximumFractionDigits: 1 })} kWh` : "-"}
                    icon={Zap}
                    trend="Cumulative from all units"
                    trendDirection="neutral"
                    iconBgClass="bg-primary/10 dark:bg-primary/20"
                    iconColorClass="text-primary"
                />
                <StatCard
                    title="Total Water"
                    value={stats.loaded ? `${stats.totalWater.toLocaleString(undefined, { maximumFractionDigits: 1 })} m³` : "-"}
                    icon={Droplets}
                    trend="Cumulative from all units"
                    trendDirection="neutral"
                    iconBgClass="bg-cyan-50 dark:bg-cyan-900/30"
                    iconColorClass="text-cyan-600 dark:text-cyan-400"
                />
                <StatCard
                    title="Online Devices"
                    value={stats.loaded ? `${stats.onlineDevices} / ${stats.totalDevices}` : "-"}
                    icon={Activity}
                    trend="System connectivity"
                    trendDirection="neutral"
                    iconBgClass="bg-green-50 dark:bg-green-900/30"
                    iconColorClass="text-green-600 dark:text-green-400"
                />
                <StatCard
                    title="Active Alerts"
                    value={stats.loaded ? String(stats.alerts) : "-"}
                    icon={AlertTriangle}
                    trend={stats.alerts > 0 ? "Needs attention" : "All clear"}
                    trendDirection={stats.alerts > 0 ? "down" : "neutral"}
                    iconBgClass={stats.alerts > 0 ? "bg-red-50 dark:bg-red-900/30" : "bg-green-50 dark:bg-green-900/30"}
                    iconColorClass={stats.alerts > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}
                    valueColorClass={stats.alerts > 0 ? "text-red-600 dark:text-red-400" : "text-gray-900"}
                />
            </div>

            <HealthPanel />

            <TrendChart />
        </div>
    );
}
