import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Power, Droplets, Zap, TrendingUp, Clock, FileText, ChevronDown, ChevronUp, Wifi, WifiOff, Activity } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { cn } from "@/lib/utils";
import mqtt from "mqtt";
import { decode as msgpackDecode } from "@msgpack/msgpack";
import { fetchApi } from "@/lib/api";

type TimeRange = "Real-Time" | "Today" | "Custom";

interface LogEntry {
    timestamp: string;
    value: number;
    unit: string;
    rawPayload: string;
    details?: IoTPayload;
}

interface IoTPayload {
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

export default function UnitDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [unitInfo, setUnitInfo] = useState<any>(null);
    const [loadingInfo, setLoadingInfo] = useState(true);

    const [powerState, setPowerState] = useState(false);
    const [waterState, setWaterState] = useState(false);
    const [timeRange, setTimeRange] = useState<TimeRange>("Real-Time");
    const [isLogsOpen, setIsLogsOpen] = useState(false);

    const [isConnected, setIsConnected] = useState(false);
    const [mqttClient, setMqttClient] = useState<mqtt.MqttClient | null>(null);
    const [realTimePower, setRealTimePower] = useState<{ time: string; value: number; timestamp: string }[]>([]);
    const [realTimeWater, setRealTimeWater] = useState<{ time: string; value: number; timestamp: string }[]>([]);
    const [liveLogs, setLiveLogs] = useState<LogEntry[]>([]);

    const [historicalTrends, setHistoricalTrends] = useState<{ time: string; powerVal: number; waterVal: number; }[]>([]);

    const [energyStats, setEnergyStats] = useState({ total_kwh: 0, active_power_w: 0 });
    const [waterStats, setWaterStats] = useState({ total_m3: 0, flow_rate_lpm: 0 });

    useEffect(() => {
        if (!id) return;
        fetchApi(`/unit/${id}`)
            .then(data => {
                setUnitInfo({
                    unit: data.unit_no,
                    tenant: data.resident_email || "Unassigned",
                    meterSerial: data.device_id,
                    status: "Unknown", // Will update below
                    lastUpdate: "Wait...",
                    energy_tariff: data.energy_tariff,
                    water_tariff: data.water_tariff,
                });
                
                // Set initial DB stats
                setEnergyStats({ total_kwh: Number(data.last_energy_reading || 0), active_power_w: 0 });
                setWaterStats({ total_m3: Number(data.last_water_reading || 0), flow_rate_lpm: 0 });
                setPowerState(!!data.relay_status);
                setWaterState(!!data.valve_status);

                return fetchApi('/unit/connectivity');
            })
            .then(conn => {
                setUnitInfo((prev: any) => {
                    if (!prev) return prev;
                    // Check if online in connectivity data
                    const isOnline = Array.isArray(conn.onlineUnitsList) && conn.onlineUnitsList.some((u: any) => u.device_id === prev.meterSerial);
                    return { ...prev, status: isOnline ? "Online" : "Offline", lastUpdate: "Live Data" };
                });
            })
            .catch(console.error)
            .finally(() => setLoadingInfo(false));
    }, [id]);

    useEffect(() => {
        if (!unitInfo?.unit || timeRange === "Real-Time") return;
        const period = timeRange === "Today" ? "daily" : "monthly";
        fetchApi(`/reporting/trends/${encodeURIComponent(unitInfo.unit)}?period=${period}`)
            .then(data => {
                const mapped = (data || []).map((t: any) => ({
                    time: new Date(t.bucket).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' }),
                    powerVal: parseFloat(t.kwh || 0),
                    waterVal: parseFloat(t.waterM3 || t.water_m3 || 0),
                }));
                setHistoricalTrends(mapped);
            })
            .catch(console.error);
    }, [unitInfo?.unit, timeRange]);

    useEffect(() => {
        if (!unitInfo?.meterSerial) return;

        const client = mqtt.connect(MQTT_CONFIG.brokerUrl, MQTT_CONFIG.options);
        const telemetryTopic = `device/${unitInfo.meterSerial}/data`;

        client.on('connect', () => {
            setIsConnected(true);
            setUnitInfo((prev: any) => ({ ...prev, status: "Online" }));
            client.subscribe([telemetryTopic], (err) => {
                if (err) console.error("Subscription error:", err);
            });
        });

        client.on('message', (topic, message) => {
            const now = new Date();
            const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            let parsed: IoTPayload;
            try {
                try {
                    parsed = msgpackDecode(message) as IoTPayload;
                } catch {
                    parsed = JSON.parse(message.toString()) as IoTPayload;
                }

                if (topic === telemetryTopic) {
                    setEnergyStats({
                        total_kwh: parsed.et ?? energyStats.total_kwh,
                        active_power_w: parsed.p ?? 0,
                    });
                    if (parsed.rs !== undefined) {
                        setPowerState(parsed.rs === 1);
                    }

                    if (parsed.p !== undefined) {
                        setRealTimePower(prev => [...prev.slice(-59), {
                            time: timeStr,
                            value: parsed.p ?? 0,
                            timestamp: now.toISOString(),
                        }]);
                    }

                    if (parsed.wf !== undefined) {
                        setRealTimeWater(prev => [...prev.slice(-59), {
                            time: timeStr,
                            value: parsed.wf ?? 0,
                            timestamp: now.toISOString(),
                        }]);
                    }

                    setWaterStats({
                        total_m3: parsed.wt ?? waterStats.total_m3,
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

        client.on('error', () => {
            setIsConnected(false);
            setUnitInfo((prev: any) => ({ ...prev, status: "Offline" }));
        });

        setMqttClient(client);

        return () => { client.end(); };
    }, [unitInfo?.meterSerial]);

    const handlePowerToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newState = e.target.checked;
        setPowerState(newState);

        if (unitInfo?.meterSerial && mqttClient && isConnected) {
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

        if (unitInfo?.meterSerial && mqttClient && isConnected) {
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

    if (loadingInfo) {
        return <div className="p-6 text-gray-500">Loading unit data...</div>;
    }

    if (!unitInfo) {
        return <div className="p-6 text-red-500">Unit not found.</div>;
    }

    const isOnline = unitInfo.status === "Online";

    const displayPowerData = timeRange === "Real-Time" ? realTimePower : historicalTrends.map(t => ({ time: t.time, value: t.powerVal }));
    const displayWaterData = timeRange === "Real-Time" ? realTimeWater : historicalTrends.map(t => ({ time: t.time, value: t.waterVal }));

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
                <div className={cn("px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2 border", isConnected ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-500 border-gray-200")}>
                    {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                    {isConnected ? "Live Data Connected" : "Connecting..."}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Control Panel */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4">Utility Controls &amp; Tariffs</h2>
                        
                        <div className="grid grid-cols-2 gap-4 mb-6">
                             <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                                 <p className="text-xs text-gray-500 uppercase font-medium">Energy Tariff</p>
                                 <p className="font-semibold text-gray-900 mt-1">Rp {Number(unitInfo.energy_tariff).toLocaleString('id-ID')} <span className="text-xs font-normal text-gray-500">/ kWh</span></p>
                             </div>
                             <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                                 <p className="text-xs text-gray-500 uppercase font-medium">Water Tariff</p>
                                 <p className="font-semibold text-gray-900 mt-1">Rp {Number(unitInfo.water_tariff).toLocaleString('id-ID')} <span className="text-xs font-normal text-gray-500">/ m³</span></p>
                             </div>
                        </div>

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
                        <div className="h-[250px] w-full min-w-0 min-h-0">
                            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
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
                                    <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                    <Area type="stepAfter" dataKey="value" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorPower)" dot={{ r: 3, fill: "#3b82f6", strokeWidth: 0 }} activeDot={{ r: 5 }} />
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
                        <div className="h-[250px] w-full min-w-0 min-h-0">
                            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                <LineChart data={displayWaterData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} />
                                    <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                    <Line type="stepAfter" dataKey="value" stroke="#06b6d4" strokeWidth={2} dot={{ r: 3, fill: "#06b6d4", strokeWidth: 0 }} activeDot={{ r: 5 }} />
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
                                        {liveLogs.length > 0 ? liveLogs.map((log, idx) => (
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
