"use client";

import { useState, use, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Power, Droplets, Zap, TrendingUp, Clock, FileText, ChevronDown, ChevronUp, Wifi, WifiOff, Activity } from "lucide-react";
import { initialData } from "@/lib/mockData";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { cn } from "@/lib/utils";
import mqtt from "mqtt";

// Types for our data
type TimeRange = "Real-Time" | "Today" | "Custom";

interface LogEntry {
    timestamp: string;
    value: number;
    unit: string;
    rawPayload: string;
    details?: any; // To store full parsed payload for the table
}

interface IoTPayload {
    timestamp?: string;
    device_id?: string;
    electricity?: {
        total_energy_kwh?: number;
        active_power_w?: number;
        voltage_v?: number;
        current_a?: number;
        frequency_hz?: number;
        power_factor?: number;
        remaining_token_kwh?: number;
        relay_status?: "ON" | "OFF" | string;
    };
    water?: {
        total_volume_m3?: number;
        flow_rate_lpm?: number;
        remaining_token_m3?: number;
        valve_status?: "OPEN" | "CLOSE" | string;
    };
    // For command echo or errors
    action?: string;
    commands?: {
        relay_command?: string;
        valve_command?: string;
    };
}

// MQTT Configuration
const MQTT_CONFIG = {
    brokerUrl: 'wss://860d79cbf30e4ed9bd13903e0dbd6db5.s1.eu.hivemq.cloud:8884/mqtt', // Using public HiveMQTT WebSocket broker
    options: {
        clientId: 'jarrdin-client-' + Math.random().toString(16).substr(2, 8),
        username: 'alat_iot',
        password: 'Flowmeter123',
    },
    topics: {
        telemetry: 'jarrdin/A-1204/telemetry',
        powerCommand: 'jarrdin/A-1204/power/command',
        waterCommand: 'jarrdin/A-1204/water/command',
    }
};

// Helper to generate mock data based on range (Fallback)
const generateMockData = (range: TimeRange, baseValue: number, variance: number) => {
    const data = [];
    const now = new Date();

    if (range === "Real-Time") {
        // Last 60 minutes, 1-minute interval
        for (let i = 59; i >= 0; i--) {
            const t = new Date(now.getTime() - i * 60000);
            data.push({
                time: t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                value: Number((baseValue + (Math.random() * variance - variance / 2)).toFixed(2)),
                timestamp: t.toISOString()
            });
        }
    } else {
        // Today, hourly
        for (let i = 0; i <= now.getHours(); i++) {
            const t = new Date();
            t.setHours(i, 0, 0, 0);
            data.push({
                time: t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                value: Number((baseValue + (Math.random() * variance - variance / 2)).toFixed(2)),
                timestamp: t.toISOString()
            });
        }
    }
    return data;
};

export default function UnitDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();

    const initialItem = initialData.find((item) => item.id === id);
    const [powerState, setPowerState] = useState(initialItem?.power ?? false);
    const [waterState, setWaterState] = useState(initialItem?.water ?? false);
    const [timeRange, setTimeRange] = useState<TimeRange>("Real-Time");
    const [isLogsOpen, setIsLogsOpen] = useState(false);

    // MQTT State
    const [isConnected, setIsConnected] = useState(false);
    const [mqttClient, setMqttClient] = useState<mqtt.MqttClient | null>(null);
    const [realTimePower, setRealTimePower] = useState<any[]>([]);
    const [realTimeWater, setRealTimeWater] = useState<any[]>([]);
    const [liveLogs, setLiveLogs] = useState<LogEntry[]>([]);

    // Real-time Stats State
    const [energyStats, setEnergyStats] = useState({ total_kwh: 0, active_power_w: 0 });
    const [waterStats, setWaterStats] = useState({ total_m3: 0, flow_rate_lpm: 0 });

    const unitInfo = initialItem || {
        unit: "Unknown Unit",
        tenant: "Unknown Tenant",
        meterSerial: "N/A",
        status: "Offline",
        lastUpdate: "N/A"
    };

    const isOnline = unitInfo.status === "Online";
    const isTargetUnit = id === "101"; // Sarah Chen (A-1204)

    // Initialize Mock Data logic if not real-time or not target unit
    const mockPowerData = useMemo(() => generateMockData(timeRange, 3.5, 1.5), [timeRange]);
    const mockWaterData = useMemo(() => generateMockData(timeRange, 0.5, 0.3), [timeRange]);

    // Initialize Real-time buffer with some mock history on load so chart isn't empty
    useEffect(() => {
        if (isTargetUnit && realTimePower.length === 0) {
            setRealTimePower(generateMockData("Real-Time", 3.5, 1.5));
            setRealTimeWater(generateMockData("Real-Time", 0.5, 0.3));
        }
    }, [isTargetUnit]);

    // MQTT Connection Logic
    useEffect(() => {
        if (!isTargetUnit) return;

        console.log("Connecting to MQTT broker...");
        const client = mqtt.connect(MQTT_CONFIG.brokerUrl, MQTT_CONFIG.options);

        client.on('connect', () => {
            console.log("MQTT Connected");
            setIsConnected(true);
            client.subscribe([MQTT_CONFIG.topics.telemetry], (err) => {
                if (err) console.error("Subscription error:", err);
            });
        });

        client.on('message', (topic, message) => {
            const payload = message.toString();
            const now = new Date();
            const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            let value = 0;
            let unit = "";
            let parsed: IoTPayload = {};

            try {
                parsed = JSON.parse(payload);

                // Logic to extract value based on topic
                // Unified Telemetry Handler
                if (topic === MQTT_CONFIG.topics.telemetry) {

                    // --- Power Data ---
                    const powerVal = parsed.electricity?.active_power_w;
                    value = powerVal !== undefined ? Number(powerVal) : 0;
                    unit = "W"; // Default unit for the list, though we likely have mixed data now

                    // Update Power Stats
                    if (parsed.electricity) {
                        setEnergyStats({
                            total_kwh: parsed.electricity.total_energy_kwh || 0,
                            active_power_w: parsed.electricity.active_power_w || 0
                        });

                        // Update Relay State
                        if (parsed.electricity.relay_status !== undefined) {
                            const relayStatus = String(parsed.electricity.relay_status).toUpperCase();
                            setPowerState(relayStatus === 'ON');
                        }
                    }

                    // --- Water Data ---
                    // Note: 'value' variable above is overwritten if we process water last? 
                    // Actually, for the GRAPH, we need to distinguish which chart gets what.
                    // But we only have ONE message handler.
                    // The 'newPoint' logic below adds to BOTH buffers if we want, OR we split it here.

                    // Let's create TWO points, one for each chart
                    const powerPoint = {
                        time: timeStr,
                        value: parsed.electricity?.active_power_w || 0,
                        timestamp: now.toISOString()
                    };
                    setRealTimePower(prev => [...prev.slice(-59), powerPoint]);

                    const waterPoint = {
                        time: timeStr,
                        value: parsed.water?.flow_rate_lpm || 0,
                        timestamp: now.toISOString()
                    };
                    setRealTimeWater(prev => [...prev.slice(-59), waterPoint]);

                    // Update Water Stats
                    if (parsed.water) {
                        setWaterStats({
                            total_m3: parsed.water.total_volume_m3 || 0,
                            flow_rate_lpm: parsed.water.flow_rate_lpm || 0
                        });
                        // Update Valve State
                        if (parsed.water.valve_status !== undefined) {
                            const valveStatus = String(parsed.water.valve_status).toUpperCase();
                            setWaterState(valveStatus === 'OPEN');
                        }
                    }

                    // Log Entry (Unified)
                    const logEntry: LogEntry = {
                        timestamp: now.toISOString(),
                        value: 0, // Placeholder, details has full data
                        unit: 'Unified',
                        rawPayload: payload,
                        details: parsed
                    };
                    setLiveLogs(prev => [logEntry, ...prev.slice(0, 49)]);

                    return; // parsing done
                }

            } catch (e) {
                console.log("Failed to parse payload", payload);
            }
        });

        client.on('error', (err) => {
            console.error("MQTT Error:", err);
            setIsConnected(false);
        });

        setMqttClient(client);

        return () => {
            console.log("Disconnecting MQTT...");
            client.end();
        };
    }, [isTargetUnit]);

    // Handle Toggles
    const handlePowerToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newState = e.target.checked;
        setPowerState(newState);

        if (isTargetUnit && mqttClient && isConnected) {
            // New Payload: Action Command
            const payloadObj = {
                timestamp: new Date().toISOString(),
                action: "device_control",
                commands: {
                    relay_command: newState ? "ON" : "OFF",
                    valve_command: waterState ? "OPEN" : "CLOSE" // Current water state
                }
            };
            const payload = JSON.stringify(payloadObj);

            mqttClient.publish(MQTT_CONFIG.topics.powerCommand, payload);

            // Log the command
            setLiveLogs(prev => [{
                timestamp: new Date().toISOString(),
                value: newState ? 1 : 0,
                unit: 'CMD',
                rawPayload: `OUTGOING: ${payload}`,
                details: payloadObj
            }, ...prev.slice(0, 49)]);
        }
    };

    const handleWaterToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newState = e.target.checked;
        setWaterState(newState);

        if (isTargetUnit && mqttClient && isConnected) {
            // New Payload: Action Command
            const payloadObj = {
                timestamp: new Date().toISOString(),
                action: "device_control",
                commands: {
                    relay_command: powerState ? "ON" : "OFF", // Current power state
                    valve_command: newState ? "OPEN" : "CLOSE"
                }
            };
            const payload = JSON.stringify(payloadObj);

            mqttClient.publish(MQTT_CONFIG.topics.waterCommand, payload);

            setLiveLogs(prev => [{
                timestamp: new Date().toISOString(),
                value: newState ? 1 : 0,
                unit: 'CMD',
                rawPayload: `OUTGOING: ${payload}`,
                details: payloadObj
            }, ...prev.slice(0, 49)]);
        }
    };

    // Decide which data to show
    // If Real-Time AND Target Unit -> Use Streamed Data
    // Else -> Use Mock Data
    const displayPowerData = (timeRange === "Real-Time" && isTargetUnit) ? realTimePower : mockPowerData;
    const displayWaterData = (timeRange === "Real-Time" && isTargetUnit) ? realTimeWater : mockWaterData;

    // Logs: Combine live logs with generated logs if not target unit (for demo consistency)
    // But requirement says "Validation Logs: Every incoming message". So for target unit, use liveLogs.
    const displayLogs = isTargetUnit ? liveLogs : useMemo(() => {
        // Fallback logs for other units
        return [...mockPowerData].reverse().slice(0, 10).map(d => ({
            timestamp: d.timestamp,
            value: d.value,
            unit: "kWh",
            rawPayload: JSON.stringify({ device_id: unitInfo.meterSerial, t: new Date(d.timestamp).getTime(), v: d.value, q: "mock" })
        }));
    }, [mockPowerData, unitInfo.meterSerial]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <button
                        onClick={() => router.back()}
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
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 ">Utility Controls</h2>

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
                        {/* Electricity Card */}
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

                        {/* Water Card */}
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

                    {/* Quick Stats / Insights */}
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
                                    {/* Stepped Area Chart with Visible Dots */}
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
                                    {/* Stepped Line Chart with Visible Dots */}
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
