import { AlertTriangle, Droplets, Zap, WifiOff, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api";

const ICON_MAP: Record<string, React.ElementType> = {
    water_leak:         Droplets,
    zero_flow:          Droplets,
    backflow:           Droplets,
    usage_spike:        Zap,
    low_power_factor:   Zap,
    voltage_anomaly:    Zap,
    mcb_trip:           Zap,
    device_offline:     WifiOff,
    jailbreak:          ShieldAlert,
    sensor_malfunction: ShieldAlert,
    low_balance:        AlertTriangle,
};

const COLOR_MAP: Record<string, { text: string; bg: string }> = {
    critical: { text: "text-red-600",    bg: "bg-red-50"    },
    warning:  { text: "text-orange-600", bg: "bg-orange-50" },
};

export function RecentAlerts() {
    const [alerts, setAlerts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Fetch recent anomalies across all units via admin endpoint
        fetchApi('/admin/anomalies')
            .then((data: any[]) => setAlerts(data.slice(0, 5)))
            .catch(() => setAlerts([]))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-900/5">
            <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold text-gray-900">Recent Alerts</h3>
            </div>
            <div className="space-y-4">
                {loading && (
                    <p className="text-sm text-gray-400">Loading alerts...</p>
                )}
                {!loading && alerts.length === 0 && (
                    <p className="text-sm text-gray-400">No recent anomalies. All systems normal.</p>
                )}
                {alerts.map((alert, i) => {
                    const Icon = ICON_MAP[alert.anomalyType] ?? AlertTriangle;
                    const colors = COLOR_MAP[alert.severity] ?? COLOR_MAP.warning;
                    const timeAgo = alert.detectedAt
                        ? new Date(alert.detectedAt).toLocaleString()
                        : "Unknown";
                    return (
                        <div key={i} className="flex items-start space-x-3 rounded-md p-2 transition-colors">
                            <div className={`mt-0.5 rounded-full p-1.5 ${colors.bg}`}>
                                <Icon className={`h-4 w-4 ${colors.text}`} />
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-medium text-gray-900">{alert.message}</p>
                                <p className="text-xs text-gray-500">{timeAgo} · Unit {alert.deviceId ?? alert.device_id}</p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
