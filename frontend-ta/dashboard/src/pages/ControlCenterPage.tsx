import { useState, useEffect } from "react";
import { SlidersHorizontal, Key, Save, Eye, EyeOff, RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
import { fetchApi } from "@/lib/api";

interface CalibrationConfig {
    CAL_FACTOR_FLOWRATE: number;
    CAL_FACTOR_POWER: number;
    SENSOR_SAMPLING_TIME: number;
}

const DEFAULTS: CalibrationConfig = {
    CAL_FACTOR_FLOWRATE: 4.55,
    CAL_FACTOR_POWER: 1.05,
    SENSOR_SAMPLING_TIME: 5,
};

export default function ControlCenterPage() {
    const [config, setConfig] = useState<CalibrationConfig>(DEFAULTS);
    const [loadingConfig, setLoadingConfig] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

    const [apiKey, setApiKey] = useState<string>('');
    const [showApiKey, setShowApiKey] = useState(false);

    useEffect(() => {
        // Load calibration settings from backend
        fetchApi('/admin/settings')
            .then((data: any) => {
                if (data) {
                    setConfig({
                        CAL_FACTOR_FLOWRATE: Number(data.CAL_FACTOR_FLOWRATE ?? DEFAULTS.CAL_FACTOR_FLOWRATE),
                        CAL_FACTOR_POWER: Number(data.CAL_FACTOR_POWER ?? DEFAULTS.CAL_FACTOR_POWER),
                        SENSOR_SAMPLING_TIME: Number(data.SENSOR_SAMPLING_TIME ?? DEFAULTS.SENSOR_SAMPLING_TIME),
                    });
                }
            })
            .catch(() => { /* endpoint not yet implemented — use defaults */ })
            .finally(() => setLoadingConfig(false));

        // Load API key from localStorage (set at login)
        const stored = localStorage.getItem('admin-api-key');
        if (stored) setApiKey(stored);
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setSaveStatus('idle');
        try {
            await fetchApi('/admin/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config),
            });
            setSaveStatus('success');
        } catch {
            setSaveStatus('error');
        } finally {
            setSaving(false);
            setTimeout(() => setSaveStatus('idle'), 3000);
        }
    };

    const handleReset = () => {
        setConfig(DEFAULTS);
        setSaveStatus('idle');
    };

    const clamp = (value: number, min: number, max: number) =>
        Math.min(max, Math.max(min, value));

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Control Center</h1>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Admin credentials and sensor calibration settings.
                </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Admin Credentials */}
                <div className="rounded-lg bg-white dark:bg-gray-800 p-6 shadow-sm ring-1 ring-gray-900/5 dark:ring-gray-700">
                    <div className="mb-5 flex items-center gap-3">
                        <div className="rounded-lg bg-gray-100 dark:bg-gray-700 p-2">
                            <Key className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                        </div>
                        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Admin Credentials</h2>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">
                                API Key
                            </label>
                            <div className="flex items-center gap-2">
                                <div className="flex-1 rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 px-3 py-2 font-mono text-sm text-gray-900 dark:text-gray-100 overflow-hidden">
                                    {apiKey
                                        ? showApiKey
                                            ? apiKey
                                            : '•'.repeat(Math.min(apiKey.length, 32))
                                        : <span className="text-gray-400 dark:text-gray-500 italic">Not set</span>
                                    }
                                </div>
                                <button
                                    onClick={() => setShowApiKey(v => !v)}
                                    className="rounded-md border border-gray-200 dark:border-gray-600 p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                    title={showApiKey ? 'Hide' : 'Reveal'}
                                >
                                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                                This key is stored locally after login. Handle with care.
                            </p>
                        </div>

                        <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3">
                            <p className="text-xs text-amber-700 dark:text-amber-400">
                                To change the API key, update the <code className="font-mono font-medium">ADMIN_API_KEY</code> environment variable in the backend and redeploy.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Calibration Settings */}
                <div className="rounded-lg bg-white dark:bg-gray-800 p-6 shadow-sm ring-1 ring-gray-900/5 dark:ring-gray-700">
                    <div className="mb-5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-primary/10 dark:bg-primary/20 p-2">
                                <SlidersHorizontal className="h-5 w-5 text-primary" />
                            </div>
                            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Sensor Calibration</h2>
                        </div>
                        <button
                            onClick={handleReset}
                            className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Reset defaults
                        </button>
                    </div>

                    {loadingConfig ? (
                        <p className="text-sm text-gray-400 dark:text-gray-500">Loading settings...</p>
                    ) : (
                        <div className="space-y-6">
                            {/* CAL_FACTOR_FLOWRATE */}
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Flow Rate Calibration Factor
                                    </label>
                                    <span className="text-sm font-mono font-semibold text-primary w-12 text-right">
                                        {config.CAL_FACTOR_FLOWRATE.toFixed(2)}
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min={0}
                                    max={5}
                                    step={0.01}
                                    value={config.CAL_FACTOR_FLOWRATE}
                                    onChange={e => setConfig(c => ({ ...c, CAL_FACTOR_FLOWRATE: clamp(parseFloat(e.target.value), 0, 5) }))}
                                    className="w-full accent-primary"
                                />
                                <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                    <span>0.00</span>
                                    <span className="text-gray-500 dark:text-gray-400">Range: 0.00 – 5.00</span>
                                    <span>5.00</span>
                                </div>
                                <input
                                    type="number"
                                    min={0} max={5} step={0.01}
                                    value={config.CAL_FACTOR_FLOWRATE}
                                    onChange={e => setConfig(c => ({ ...c, CAL_FACTOR_FLOWRATE: clamp(parseFloat(e.target.value) || 0, 0, 5) }))}
                                    className="mt-2 h-8 w-32 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                />
                            </div>

                            {/* CAL_FACTOR_POWER */}
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Power Calibration Factor
                                    </label>
                                    <span className="text-sm font-mono font-semibold text-primary w-12 text-right">
                                        {config.CAL_FACTOR_POWER.toFixed(2)}
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min={0}
                                    max={2}
                                    step={0.01}
                                    value={config.CAL_FACTOR_POWER}
                                    onChange={e => setConfig(c => ({ ...c, CAL_FACTOR_POWER: clamp(parseFloat(e.target.value), 0, 2) }))}
                                    className="w-full accent-primary"
                                />
                                <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                    <span>0.00</span>
                                    <span className="text-gray-500 dark:text-gray-400">Range: 0.00 – 2.00</span>
                                    <span>2.00</span>
                                </div>
                                <input
                                    type="number"
                                    min={0} max={2} step={0.01}
                                    value={config.CAL_FACTOR_POWER}
                                    onChange={e => setConfig(c => ({ ...c, CAL_FACTOR_POWER: clamp(parseFloat(e.target.value) || 0, 0, 2) }))}
                                    className="mt-2 h-8 w-32 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                />
                            </div>

                            {/* SENSOR_SAMPLING_TIME */}
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Sensor Sampling Time
                                    </label>
                                    <span className="text-sm font-mono font-semibold text-primary w-12 text-right">
                                        {config.SENSOR_SAMPLING_TIME}s
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min={1}
                                    max={10}
                                    step={1}
                                    value={config.SENSOR_SAMPLING_TIME}
                                    onChange={e => setConfig(c => ({ ...c, SENSOR_SAMPLING_TIME: clamp(parseInt(e.target.value), 1, 10) }))}
                                    className="w-full accent-primary"
                                />
                                <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                    <span>1s</span>
                                    <span className="text-gray-500 dark:text-gray-400">Range: 1 – 10 seconds</span>
                                    <span>10s</span>
                                </div>
                                <input
                                    type="number"
                                    min={1} max={10} step={1}
                                    value={config.SENSOR_SAMPLING_TIME}
                                    onChange={e => setConfig(c => ({ ...c, SENSOR_SAMPLING_TIME: clamp(parseInt(e.target.value) || 1, 1, 10) }))}
                                    className="mt-2 h-8 w-32 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                />
                            </div>

                            {/* Save button */}
                            <div className="flex items-center gap-3 pt-2">
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                                >
                                    <Save className="h-4 w-4" />
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </button>
                                {saveStatus === 'success' && (
                                    <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                                        <CheckCircle className="h-4 w-4" /> Saved
                                    </span>
                                )}
                                {saveStatus === 'error' && (
                                    <span className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
                                        <AlertCircle className="h-4 w-4" /> Save failed — endpoint not implemented yet
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
