import { AlertTriangle, Droplets, Zap } from "lucide-react";

const alerts = [
    {
        id: 1,
        type: "critical",
        message: "Water leak detected in Unit 1204",
        time: "10 min ago",
        icon: Droplets,
        color: "text-red-600",
        bg: "bg-red-50",
    },
    {
        id: 2,
        type: "warning",
        message: "High power usage anomaly in Unit 805",
        time: "25 min ago",
        icon: Zap,
        color: "text-orange-600",
        bg: "bg-orange-50",
    },
    {
        id: 3,
        type: "critical",
        message: "Meter tampering detected in Unit 302",
        time: "1 hour ago",
        icon: AlertTriangle,
        color: "text-red-600",
        bg: "bg-red-50",
    },
];

export function RecentAlerts() {
    return (
        <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-900/5">
            <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold text-gray-900">Recent Alerts</h3>
                <button className="text-sm font-medium text-primary hover:text-primary/80">
                    View all
                </button>
            </div>
            <div className="space-y-4">
                {alerts.map((alert) => (
                    <div key={alert.id} className="flex items-start space-x-3 rounded-md p-2 transition-colors hover:bg-gray-50">
                        <div className={`mt-0.5 rounded-full p-1.5 ${alert.bg}`}>
                            <alert.icon className={`h-4 w-4 ${alert.color}`} />
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">{alert.message}</p>
                            <p className="text-xs text-gray-500">{alert.time}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
