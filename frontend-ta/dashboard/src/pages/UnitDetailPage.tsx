import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Power, Droplets, Zap, TrendingUp, Clock, FileText, ChevronDown, ChevronUp, Wifi, WifiOff, Activity } from "lucide-react";
import { initialData } from "@/lib/mockData";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { cn } from "@/lib/utils";
import mqtt from "mqtt";
import { decode as msgpackDecode } from "@msgpack/msgpack";

type TimeRange = "Real-Time" | "Today" | "Custom";

interface LogEntry {
    timestamp: string;
    value: number;
    unit: string;
    rawPayload: string;
    details?: IoTPayload;
}

interface IoTPayload {
    // Lean telemetry keys (current format)
    et?: number;   // energy_total kWh
    p?: number;    // active power W
    v?: number;    // voltage V
    c?: number;    // current A
    rs?: number;   // relay_status: 1=ON, 0=OFF
    wt?: number;   // water_total m³
    wf?: number;   // water flow rate L/min
    vs?: number;   // valve_status: 1=OPEN, 0=CLOSE
}

const MQTT_CONFIG = {
    brokerUrl: import.meta.env.VITE_MQTT_BROKER_URL || 'ws://localhost:8083/mqtt',
    options: {
        clientId: 'ta-dashboard-' + Math.random().toString(16).substring(2, 10),
        username: import.meta.env.VITE_MQTT_USERNAME || '',
        password: import.meta.env.VITE_MQTT_PASSWORD || '',
    }
};

const generateMockData = (range: TimeRange, baseValue: number, variance: number) => {
    const data = [];
    const now = new Date();

    if (range === "Real-Time") {
        for (let i = 59; i >= 0; i--) {
            const t = new Date(now.getTime() - i * 60000);
            data.push({
                time: t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                value: Number((baseValue + (Math.random() * variance - variance / 2)).toFixed(2)),
                timestamp: t.toISOString(),
            });
        }
    } else {
        for (let i = 0; i <= now.getHours(); i++) {
            const t = new Date();
            t.setHours(i, 0, 0, 0);
            data.push({
                time: t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                value: Number((baseValue + (Math.random() * variance - variance / 2)).toFixed(2)),
                timestamp: t.toISOString(),
            });
        }
    }
    return data;
};

export default function UnitDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const initialItem = initialData.find((item) => item.id === id);
    const [powerState, setPowerState] = useState(initialItem?.power ?? false);
    const [waterState, setWaterState] = useState(initialItem?.water ?? false);
    const [timeRange, setTimeRange] = useState<TimeRange>("Real-Time");
    const [isLogsOpen, setIsLogsOpen] = useState(false);

    const [isConnected, setIsConnected] = useState(false);
    const [mqttClient, setMqttClient] = useState<mqtt.MqttClient | null>(null);
    const [realTimePower, setRealTimePower] = useState<{ time: string; value: number; timestamp: string }[]>([]);
    const [realTimeWater, setRealTimeWater] = useState<{ time: string; value: number; timestamp: string }[]>([]);
    const [liveLogs, setLiveLogs] = useState<LogEntry[]>([]);

    const [energyStats, setEnergyStats] = useState({ total_kwh: 0, active_power_w: 0 });
    const [waterStats, setWaterStats] = useState({ total_m3: 0, flow_rate_lpm: 0 });

    const unitInfo = initialItem ?? {
        unit: "Unknown Unit",
        tenant: "Unknown Tenant",
        meterSerial: "N/A",
        status: "Offline",
        lastUpdate: "N/A",
    };

    const isOnline = unitInfo.status === "Online";
    const isTargetUnit = id === "101";

    const mockPowerData = useMemo(() => generateMockData(timeRange, 3.5, 1.5), [timeRange]);
    const mockWaterData = useMemo(() => generateMockData(timeRange, 0.5, 0.3), [timeRange]);

    const fallbackLogs = useMemo(() => {
        return [...mockPowerData].reverse().slice(0, 10).map(d => ({
            timestamp: d.timestamp,
            value: d.value,
            unit: "kWh",
            rawPayload: JSON.stringify({ device_id: unitInfo.meterSerial, t: new Date(d.timestamp).getTime(), v: d.value, q: "mock" }),
        }));
    }, [mockPowerData, unitInfo.meterSerial]);

    const displayLogs = isTargetUnit ? liveLogs : fallbackLogs;

    useEffect(() => {
        if (isTargetUnit && realTimePower.length === 0) {
            setRealTimePower(generateMockData("Real-Time", 3.5, 1.5));
            setRealTimeWater(generateMockData("Real-Time", 0.5, 0.3));
        }
    }, [isTargetUnit, realTimePower.length]);

    useEffect(() => {
        if (!isTargetUnit) return;

        const client = mqtt.connect(MQTT_CONFIG.brokerUrl, MQTT_CONFIG.options);

        const telemetryTopic = `device/${unitInfo.meterSerial}/data`;

        client.on('connect', () => {
            setIsConnected(true);
            client.subscribe([telemetryTopic], (err) => {
                if (err) console.error("Subscription error:", err);
            });
        });

        client.on('message', (topic, message) => {
            const now = new Date();
            const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            let parsed: IoTPayload;
            try {
                // Prefer MessagePack binary decode; fall back to JSON string
                try {
                    parsed = msgpackDecode(message) as IoTPayload;
                } catch {
                    parsed = JSON.parse(message.toString()) as IoTPayload;
                }

                // Parse ultra-lightweight telemetry keys
                if (topic === telemetryTopic) {
                    setEnergyStats({
                        total_kwh: parsed.et ?? 0,
                        active_power_w: parsed.p ?? 0,
                    });
                    if (parsed.rs !== undefined) {
                        setPowerState(parsed.rs === 1);
                    }

                    setRealTimePower(prev => [...prev.slice(-59), {
                        time: timeStr,
                        value: parsed.p ?? 0,
                        timestamp: now.toISOString(),
                    }]);

                    setRealTimeWater(prev => [...prev.slice(-59), {
                        time: timeStr,
                        value: parsed.wf ?? 0,
                        timestamp: now.toISOString(),
                    }]);

                    setWaterStats({
                        total_m3: parsed.wt ?? 0,
                        flow_rate_lpm: parsed.wf ?? 0,
                    });
                    if (parsed.vs !== undefined) {
                        setWaterState(parsed.vs === 1);
                    }

                    setLiveLogs(prev => [{
                        timestamp: now.toISOString(),
                        value: parsed.p ?? 0,
                        unit: 'W',
                        rawPayload: `[MsgPack] et:${parsed.et} p:${parsed.p} wf:${parsed.wf} rs:${parsed.rs} vs:${parsed.vs}`,
                        details: parsed,
                    }, ...prev.slice(0, 49)]);
                }
            } catch {
                console.log("Failed to decode telemetry payload");
            }
        });

        client.on('error', () => setIsConnected(false));

        setMqttClient(client);

        return () => { client.end(); };
    }, [isTargetUnit]);

    const handlePowerToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newState = e.target.checked;
        setPowerState(newState);

        if (isTargetUnit && mqttClient && isConnected) {
            const cmdTopic = `device/${unitInfo.meterSerial}/relay/set`;
            const payload = newState ? "1" : "0";
            mqttClient.publish(cmdTopic, payload);
            setLiveLogs(prev => [{
                timestamp: new Date().toISOString(),
                value: newState ? 1 : 0,
                unit: 'CMD',
                rawPayload: `OUTGOING To ${cmdTopic}: ${payload}`,
            }, ...prev.slice(0, 49)]);
        }
    };

    const handleWaterToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newState = e.target.checked;
        setWaterState(newState);

        if (isTargetUnit && mqttClient && isConnected) {
            const cmdTopic = `device/${unitInfo.meterSerial}/valve/set`;
            const payload = newState ? "1" : "0";
            mqttClient.publish(cmdTopic, payload);
            setLiveLogs(prev => [{
                timestamp: new Date().toISOString(),
                value: newState ? 1 : 0,
                unit: 'CMD',
                rawPayload: `OUTGOING To ${cmdTopic}: ${payload}`,
            }, ...prev.slice(0, 49)]);
        }
    };

    const displayPowerData = (timeRange === "Real-Time" && isTargetUnit) ? realTimePower : mockPowerData;
    const displayWaterData = (timeRange === "Real-Time" && isTargetUnit) ? realTimeWater : mockWaterData;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-gray-600" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                            {unitInfo.unit}
                            <span className={cn(
                                "text-sm font-medium px-2.5 py-0.5 rounded-full border",
                                isOnline
                                    ? "bg-green-50 text-green-700 border-green-200"
                                    : "bg-red-50 text-red-700 border-red-200"
                            )}>
                                {unitInfo.status}
                            </span>
                        </h1>
                        <p className="text-gray-500">{unitInfo.tenant} • {unitInfo.meterSerial}</p>
                    </div>
                </div>
                {isTargetUnit && (
                    <div className={cn("px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2 border", isConnected ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-500 border-gray-200")}>
                        {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                        {isConnected ? "Live Data Connected" : "Connecting..."}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Control Panel */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4">Utility Controls</h2>

                        {/* Power Control */}
                        <div className="mb-6 p-4 rounded-lg bg-gray-50 border border-gray-100">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <div className={cn("p-2 rounded-lg", powerState ? "bg-primary/10 text-primary" : "bg-gray-200 text-gray-500")}>
                                        <Power className="w-5 h-5" />
                                    </div>
                                    <span className="font-medium text-gray-900">Power Supply</span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={powerState}
                                        onChange={handlePowerToggle}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                </label>
                            </div>
                            <p className="text-xs text-gray-500 ml-1">
                                {powerState ? "Main grid connected. Normal operation." : "Power disconnected. Emergency mode only."}
                            </p>
                        </div>

                        {/* Water Control */}
                        <div className="p-4 rounded-lg bg-gray-50 border border-gray-100">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <div className={cn("p-2 rounded-lg", waterState ? "bg-cyan-100 text-cyan-600" : "bg-gray-200 text-gray-500")}>
                                        <Droplets className="w-5 h-5" />
                                    </div>
                                    <span className="font-medium text-gray-900">Water Supply</span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={waterState}
                                        onChange={handleWaterToggle}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                                </label>
                            </div>
                            <p className="text-xs text-gray-500 ml-1">
                                {waterState ? "Valve OPEN. Flow rate normal." : "Valve CLOSED. No water flow."}
                            </p>
                        </div>
                    </div>

                    {/* Live Telemetry Cards */}
                    <div className="grid grid-cols-1 gap-4">
                        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-3">
                                <Activity className={cn("w-4 h-4", isConnected ? "text-green-500 animate-pulse" : "text-gray-300")} />
                            </div>
                            <div className="flex items-center gap-3 mb-3">
                                <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
                                    <Zap className="w-5 h-5" />
                                </div>
                                <h3 className="font-semibold text-gray-900">Electricity</h3>
                            </div>
                            <div className="space-y-3">
                                <div>
                                    <p className="text-xs text-gray-500 uppercase font-medium">Active Power</p>
                                    <p className="text-2xl font-bold text-gray-900">
                                        {energyStats.active_power_w.toFixed(2)} <span className="text-sm font-medium text-gray-500">W</span>
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 uppercase font-medium">Total Energy</p>
                                    <p className="text-lg font-semibold text-gray-700">
                                        {energyStats.total_kwh.toFixed(2)} <span className="text-sm font-medium text-gray-500">kWh</span>
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-3">
                                <Activity className={cn("w-4 h-4", isConnected ? "text-cyan-500 animate-pulse" : "text-gray-300")} />
                            </div>
                            <div className="flex items-center gap-3 mb-3">
                                <div className="p-2 bg-cyan-50 rounded-lg text-cyan-600">
                                    <Droplets className="w-5 h-5" />
                                </div>
                                <h3 className="font-semibold text-gray-900">Water Flow</h3>
                            </div>
                            <div className="space-y-3">
                                <div>
                                    <p className="text-xs text-gray-500 uppercase font-medium">Flow Rate</p>
                                    <p className="text-2xl font-bold text-gray-900">
                                        {waterStats.flow_rate_lpm.toFixed(2)} <span className="text-sm font-medium text-gray-500">L/min</span>
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 uppercase font-medium">Total Volume</p>
                                    <p className="text-lg font-semibold text-gray-700">
                                        {waterStats.total_m3.toFixed(2)} <span className="text-sm font-medium text-gray-500">m³</span>
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Quick Stats */}
                    <div className="grid grid-cols-1 gap-4">
                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-start gap-4">
                            <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
                                <Zap className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-gray-500">Avg. Daily Power</p>
                                <p className="text-lg font-bold text-gray-900">12.4 kWh</p>
                                <div className="flex items-center text-xs text-green-600 mt-1">
                                    <TrendingUp className="w-3 h-3 mr-1" />
                                    <span>-5% vs last week</span>
                                </div>
                            </div>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-start gap-4">
                            <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                                <Clock className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-gray-500">Last Maintenance</p>
                                <p className="text-lg font-bold text-gray-900">14 Days Ago</p>
                                <p className="text-xs text-gray-400 mt-1">Next due: Mar 15, 2026</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Charts Area */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Power Chart */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-semibold text-gray-900">Power Consumption</h3>
                            <select
                                value={timeRange}
                                onChange={(e) => setTimeRange(e.target.value as TimeRange)}
                                className="text-sm border-gray-200 bg-gray-50 rounded-md px-2 py-1 text-gray-900 focus:ring-primary focus:border-primary"
                            >
                                <option value="Real-Time">Real-Time (60m)</option>
                                <option value="Today">Today</option>
                                <option value="Custom">Custom Range</option>
                            </select>
                        </div>
                        <div className="h-[250px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={displayPowerData}>
                                    <defs>
                                        <linearGradient id="colorPower" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} />
                                    <RechartsTooltip
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Area
                                        type="stepAfter"
                                        dataKey="value"
                                        stroke="#3b82f6"
                                        strokeWidth={2}
                                        fillOpacity={1}
                                        fill="url(#colorPower)"
                                        dot={{ r: 3, fill: "#3b82f6", strokeWidth: 0 }}
                                        activeDot={{ r: 5 }}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Water Chart */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-semibold text-gray-900">Water Consumption</h3>
                            <div className="text-sm font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded">
                                {timeRange} View
                            </div>
                        </div>
                        <div className="h-[250px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={displayWaterData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} />
                                    <RechartsTooltip
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Line
                                        type="stepAfter"
                                        dataKey="value"
                                        stroke="#06b6d4"
                                        strokeWidth={2}
                                        dot={{ r: 3, fill: "#06b6d4", strokeWidth: 0 }}
                                        activeDot={{ r: 5 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Raw Data Validation Tool */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <button
                            onClick={() => setIsLogsOpen(!isLogsOpen)}
                            className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-gray-500" />
                                <span className="font-semibold text-gray-900 text-sm">Raw Sensor Logs (Validation)</span>
                            </div>
                            {isLogsOpen ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                        </button>

                        {isLogsOpen && (
                            <div className="overflow-x-auto max-h-96">
                                <table className="w-full text-left text-xs font-mono">
                                    <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 sticky top-0">
                                        <tr>
                                            <th className="px-4 py-2 font-medium">Timestamp</th>
                                            <th className="px-4 py-2 font-medium">Value</th>
                                            <th className="px-4 py-2 font-medium">Command/Unit</th>
                                            <th className="px-4 py-2 font-medium">Raw Payload (JSON)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {displayLogs.length > 0 ? displayLogs.map((log, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50">
                                                <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{log.timestamp}</td>
                                                <td className="px-4 py-2 text-gray-900 font-bold">{log.value}</td>
                                                <td className="px-4 py-2 text-gray-500">{log.unit}</td>
                                                <td className="px-4 py-2 text-slate-600 truncate max-w-xs" title={log.rawPayload}>
                                                    {log.rawPayload}
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan={4} className="px-4 py-4 text-center text-gray-500">No logs waiting...</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
