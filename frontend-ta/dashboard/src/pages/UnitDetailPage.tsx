import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useIsDark } from "@/lib/useIsDark";
import { ArrowLeft, Power, Droplets, Zap, FileText, ChevronDown, ChevronUp, Wifi, WifiOff, Activity } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { cn } from "@/lib/utils";
import mqtt from "mqtt";
import { fetchApi } from "@/lib/api";

function encodeCommand(type: 'relay' | 'valve', value: 0 | 1): Uint8Array {
    const typeNibble = type === 'relay' ? 0x10 : 0x20;
    return new Uint8Array([typeNibble | (value & 0x0f)]);
}

function decodeTelemetry(buf: Uint8Array): IoTPayload | null {
    if (buf.length < 21) return null;
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    return {
        et: view.getUint32(0, false)  / 100,
        p:  view.getUint16(4, false)  / 10,
        v:  view.getUint16(6, false)  / 10,
        c:  view.getUint16(8, false)  / 1000,
        wf: view.getUint16(10, false) / 100,
        wt: view.getUint32(12, false) / 1000,
        rs: buf[20] & 1,
        vs: (buf[20] >> 1) & 1,
    };
}

type TimeRange = "Real-Time" | "Today" | "Custom";

interface LogEntry {
    timestamp: string;
    value: number;
    unit: string;
    rawPayload: string;
    details?: IoTPayload;
}

interface IoTPayload {
    et?: number;
    p?: number;
    v?: number;
    c?: number;
    wf?: number;
    wt?: number;
    rs?: number;
    vs?: number;
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
    const isDark = useIsDark();
    const gridColor = isDark ? '#374151' : '#E5E7EB';
    const tickColor = '#9CA3AF';
    const tooltipStyle = {
        borderRadius: '8px',
        border: `1px solid ${isDark ? '#374151' : '#E5E7EB'}`,
        background: isDark ? '#1F2937' : '#ffffff',
        color: isDark ? '#F3F4F6' : '#111827',
        fontSize: '12px',
    };

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
                    status: "Unknown",
                    lastUpdate: "Wait...",
                });
                setEnergyStats({ total_kwh: Number(data.last_energy_reading || 0), active_power_w: 0 });
                setWaterStats({ total_m3: Number(data.last_water_reading || 0), flow_rate_lpm: 0 });
                setPowerState(!!data.relay_status);
                setWaterState(!!data.valve_status);

                return fetchApi('/unit/connectivity');
            })
            .then(conn => {
                setUnitInfo((prev: any) => {
                    if (!prev) return prev;
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

            try {
                const parsed = decodeTelemetry(message);
                if (!parsed) { console.warn(`Telemetry frame too short: ${message.length}B`); return; }

                if (topic === telemetryTopic) {
                    setEnergyStats({
                        total_kwh: parsed.et ?? energyStats.total_kwh,
                        active_power_w: parsed.p ?? 0,
                    });
                    if (parsed.rs !== undefined) setPowerState(parsed.rs === 1);

                    if (parsed.p !== undefined) {
                        setRealTimePower(prev => [...prev.slice(-59), { time: timeStr, value: parsed.p ?? 0, timestamp: now.toISOString() }]);
                    }
                    if (parsed.wf !== undefined) {
                        setRealTimeWater(prev => [...prev.slice(-59), { time: timeStr, value: parsed.wf ?? 0, timestamp: now.toISOString() }]);
                    }

                    setWaterStats({ total_m3: parsed.wt ?? waterStats.total_m3, flow_rate_lpm: parsed.wf ?? 0 });
                    if (parsed.vs !== undefined) setWaterState(parsed.vs === 1);

                    setLiveLogs(prev => [{
                        timestamp: now.toISOString(),
                        value: parsed.p ?? 0,
                        unit: 'W',
                        rawPayload: `[Binary 21B] et:${parsed.et} p:${parsed.p} v:${parsed.v} c:${parsed.c} wf:${parsed.wf} wt:${parsed.wt} rs:${parsed.rs} vs:${parsed.vs}`,
                        details: parsed,
                    }, ...prev.slice(0, 49)]);
                }
            } catch (err) {
                console.warn("Failed to decode telemetry payload:", err);
            }
        });

        client.on('error', () => {
            setIsConnected(false);
            setUnitInfo((prev: any) => ({ ...prev, status: "Offline" }));
        });

        setMqttClient(client);
        return () => { client.end(); };
    }, [unitInfo?.meterSerial]);

    const handlePowerToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const newState = e.target.checked;
        setPowerState(newState);
        if (id) {
            fetchApi(`/unit/${id}/relay`, { method: 'PATCH', body: JSON.stringify({ relayStatus: newState }) }).catch(console.error);
        }
        if (unitInfo?.meterSerial && mqttClient && isConnected) {
            const cmdTopic = `device/${unitInfo.meterSerial}/command`;
            const payload = encodeCommand('relay', newState ? 1 : 0);
            mqttClient.publish(cmdTopic, payload as any);
            setLiveLogs(prev => [{
                timestamp: new Date().toISOString(), value: newState ? 1 : 0, unit: 'CMD',
                rawPayload: `OUTGOING [Binary] ${cmdTopic}: relay=${newState ? 1 : 0} (0x${payload[0].toString(16).toUpperCase()}) 1B`,
            }, ...prev.slice(0, 49)]);
        }
    };

    const handleWaterToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newState = e.target.checked;
        setWaterState(newState);
        if (unitInfo?.meterSerial && mqttClient && isConnected) {
            const cmdTopic = `device/${unitInfo.meterSerial}/command`;
            const payload = encodeCommand('valve', newState ? 1 : 0);
            mqttClient.publish(cmdTopic, payload as any);
            setLiveLogs(prev => [{
                timestamp: new Date().toISOString(), value: newState ? 1 : 0, unit: 'CMD',
                rawPayload: `OUTGOING [Binary] ${cmdTopic}: valve=${newState ? 1 : 0} (0x${payload[0].toString(16).toUpperCase()}) 1B`,
            }, ...prev.slice(0, 49)]);
        }
    };

    if (loadingInfo) {
        return <div className="p-6 text-gray-500 dark:text-gray-400">Loading unit data...</div>;
    }
    if (!unitInfo) {
        return <div className="p-6 text-red-500 dark:text-red-400">Unit not found.</div>;
    }

    const isOnline = unitInfo.status === "Online";
    const displayPowerData = timeRange === "Real-Time" ? realTimePower : historicalTrends.map(t => ({ time: t.time, value: t.powerVal }));
    const displayWaterData = timeRange === "Real-Time" ? realTimeWater : historicalTrends.map(t => ({ time: t.time, value: t.waterVal }));

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
                            {unitInfo.unit}
                            <span className={cn(
                                "text-sm font-medium px-2.5 py-0.5 rounded-full border",
                                isOnline
                                    ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
                                    : "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800"
                            )}>
                                {unitInfo.status}
                            </span>
                        </h1>
                        <p className="text-gray-500 dark:text-gray-400">{unitInfo.tenant} · {unitInfo.meterSerial}</p>
                    </div>
                </div>
                <div className={cn("px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2 border", isConnected ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800" : "bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600")}>
                    {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                    {isConnected ? "Live Data Connected" : "Connecting..."}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Utility Controls</h2>

                        <div className="mb-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-600">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <div className={cn("p-2 rounded-lg", powerState ? "bg-primary/10 dark:bg-primary/20 text-primary" : "bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400")}>
                                        <Power className="w-5 h-5" />
                                    </div>
                                    <span className="font-medium text-gray-900 dark:text-gray-100">Power Supply</span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" checked={powerState} onChange={handlePowerToggle} className="sr-only peer" />
                                    <div className="w-11 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                </label>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                                {powerState ? "Main grid connected." : "Power disconnected."}
                            </p>
                        </div>

                        <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-600">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <div className={cn("p-2 rounded-lg", waterState ? "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400" : "bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400")}>
                                        <Droplets className="w-5 h-5" />
                                    </div>
                                    <span className="font-medium text-gray-900 dark:text-gray-100">Water Supply</span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" checked={waterState} onChange={handleWaterToggle} className="sr-only peer" />
                                    <div className="w-11 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                                </label>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                                {waterState ? "Valve OPEN." : "Valve CLOSED."}
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-3">
                                <Activity className={cn("w-4 h-4", isConnected ? "text-green-500 animate-pulse" : "text-gray-300 dark:text-gray-600")} />
                            </div>
                            <div className="flex items-center gap-3 mb-3">
                                <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-amber-600 dark:text-amber-400">
                                    <Zap className="w-5 h-5" />
                                </div>
                                <h3 className="font-semibold text-gray-900 dark:text-gray-100">Electricity</h3>
                            </div>
                            <div className="space-y-3">
                                <div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium">Active Power</p>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                        {energyStats.active_power_w.toFixed(2)} <span className="text-sm font-medium text-gray-500 dark:text-gray-400">W</span>
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium">Total Energy</p>
                                    <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">
                                        {energyStats.total_kwh.toFixed(2)} <span className="text-sm font-medium text-gray-500 dark:text-gray-400">kWh</span>
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-3">
                                <Activity className={cn("w-4 h-4", isConnected ? "text-cyan-500 animate-pulse" : "text-gray-300 dark:text-gray-600")} />
                            </div>
                            <div className="flex items-center gap-3 mb-3">
                                <div className="p-2 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg text-cyan-600 dark:text-cyan-400">
                                    <Droplets className="w-5 h-5" />
                                </div>
                                <h3 className="font-semibold text-gray-900 dark:text-gray-100">Water Flow</h3>
                            </div>
                            <div className="space-y-3">
                                <div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium">Flow Rate</p>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                        {waterStats.flow_rate_lpm.toFixed(2)} <span className="text-sm font-medium text-gray-500 dark:text-gray-400">L/min</span>
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium">Total Volume</p>
                                    <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">
                                        {waterStats.total_m3.toFixed(2)} <span className="text-sm font-medium text-gray-500 dark:text-gray-400">m³</span>
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Power Consumption</h3>
                            <select
                                value={timeRange}
                                onChange={(e) => setTimeRange(e.target.value as TimeRange)}
                                className="text-sm border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 focus:ring-primary focus:border-primary outline-none"
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
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: tickColor, fontSize: 11 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: tickColor, fontSize: 11 }} width={36} />
                                    <RechartsTooltip contentStyle={tooltipStyle} />
                                    <Area type="stepAfter" dataKey="value" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorPower)" dot={false} activeDot={{ r: 4 }} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Water Consumption</h3>
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                                {timeRange} View
                            </span>
                        </div>
                        <div className="h-[250px] w-full min-w-0 min-h-0">
                            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                <LineChart data={displayWaterData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: tickColor, fontSize: 11 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: tickColor, fontSize: 11 }} width={36} />
                                    <RechartsTooltip contentStyle={tooltipStyle} />
                                    <Line type="stepAfter" dataKey="value" stroke="#06b6d4" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                        <button
                            onClick={() => setIsLogsOpen(!isLogsOpen)}
                            className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                                <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Raw Sensor Logs (Validation)</span>
                            </div>
                            {isLogsOpen ? <ChevronUp className="w-4 h-4 text-gray-500 dark:text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400" />}
                        </button>

                        {isLogsOpen && (
                            <div className="overflow-x-auto max-h-96">
                                <table className="w-full text-left text-xs font-mono">
                                    <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 sticky top-0">
                                        <tr>
                                            <th className="px-4 py-2 font-medium">Timestamp</th>
                                            <th className="px-4 py-2 font-medium">Value</th>
                                            <th className="px-4 py-2 font-medium">Unit</th>
                                            <th className="px-4 py-2 font-medium">Raw Payload</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                        {liveLogs.length > 0 ? liveLogs.map((log, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                                <td className="px-4 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">{log.timestamp}</td>
                                                <td className="px-4 py-2 text-gray-900 dark:text-gray-100 font-bold">{log.value}</td>
                                                <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{log.unit}</td>
                                                <td className="px-4 py-2 text-slate-600 dark:text-slate-400 truncate max-w-xs" title={log.rawPayload}>
                                                    {log.rawPayload}
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan={4} className="px-4 py-4 text-center text-gray-500 dark:text-gray-400">No logs yet...</td>
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
