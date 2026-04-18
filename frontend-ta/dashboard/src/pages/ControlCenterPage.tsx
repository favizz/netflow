import { useState, useEffect, useCallback } from "react";
import { SlidersHorizontal, Save, RefreshCw, CheckCircle, AlertCircle, Zap, Droplets, Loader2, Clock, Pencil, Check, X } from "lucide-react";
import { fetchApi } from "@/lib/api";

interface CalibrationConfig {
    CAL_FACTOR_FLOWRATE: number;
    CAL_FACTOR_POWER: number;
    SENSOR_SAMPLING_TIME: number;
}

interface Tariff {
    id: number;
    utility_type: 'electricity' | 'water';
    price_per_unit: number;
    effective_date: string;
}

const DEFAULTS: CalibrationConfig = {
    CAL_FACTOR_FLOWRATE: 4.55,
    CAL_FACTOR_POWER: 1.05,
    SENSOR_SAMPLING_TIME: 5,
};

function TariffCard({ icon, label, unit, tariff, onSave }: {
    icon: React.ReactNode;
    label: string;
    unit: string;
    tariff: Tariff | null;
    onSave: (price: number, date: string) => Promise<void>;
}) {
    const [editing, setEditing] = useState(false);
    const [price, setPrice] = useState('');
    const [date, setDate] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const startEdit = () => {
        setPrice(tariff ? String(tariff.price_per_unit) : '');
        setDate(tariff ? tariff.effective_date : new Date().toISOString().split('T')[0]);
        setError(null);
        setEditing(true);
    };

    const handleSave = async () => {
        const p = parseFloat(price);
        if (!p || p <= 0) { setError('Enter a valid price.'); return; }
        if (!date) { setError('Enter a valid date.'); return; }
        setSaving(true);
        setError(null);
        try {
            await onSave(p, date);
            setEditing(false);
        } catch (err: any) {
            setError(err.message?.replace(/^API error \(\d+\): /, '') || 'Could not save tariff.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="rounded-lg border border-gray-200 dark:border-gray-600 p-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    {icon}
                    {label} <span className="text-gray-400 dark:text-gray-500 font-normal">({unit})</span>
                </div>
                {!editing && (
                    <button onClick={startEdit} className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-primary transition-colors">
                        <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                )}
            </div>

            {!editing ? (
                tariff ? (
                    <div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                            Rp {Number(tariff.price_per_unit).toLocaleString('id-ID')}
                        </p>
                        <p className="mt-1 flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                            <Clock className="h-3 w-3" /> Effective from {tariff.effective_date}
                        </p>
                    </div>
                ) : (
                    <p className="text-sm text-gray-400 dark:text-gray-500">No tariff configured yet.</p>
                )
            ) : (
                <div className="space-y-2">
                    {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
                    <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Price per unit (Rp)</label>
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={price}
                            onChange={e => setPrice(e.target.value)}
                            className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="e.g. 1444.70"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Effective from</label>
                        <input
                            type="date"
                            value={date}
                            onChange={e => setDate(e.target.value)}
                            className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                        <button onClick={() => setEditing(false)} className="flex items-center gap-1 rounded-md border border-gray-200 dark:border-gray-600 px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                            <X className="h-3.5 w-3.5" /> Cancel
                        </button>
                        <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-60">
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            Save
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function SliderField({ label, value, min, max, step, unit, onChange }: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    unit?: string;
    onChange: (v: number) => void;
}) {
    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
                <span className="text-sm font-semibold text-primary font-mono">
                    {step < 1 ? value.toFixed(2) : value}{unit}
                </span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={e => {
                    const v = step < 1 ? parseFloat(e.target.value) : parseInt(e.target.value);
                    onChange(Math.min(max, Math.max(min, v)));
                }}
                className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                <span>{min}{unit}</span>
                <span>{max}{unit}</span>
            </div>
        </div>
    );
}

export default function ControlCenterPage() {
    const [config, setConfig] = useState<CalibrationConfig>(DEFAULTS);
    const [loadingConfig, setLoadingConfig] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

    const [elecTariff, setElecTariff] = useState<Tariff | null>(null);
    const [waterTariff, setWaterTariff] = useState<Tariff | null>(null);
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);

    const loadTariffs = useCallback(() => {
        fetchApi('/admin/tariff')
            .then((data: Tariff[]) => {
                if (!Array.isArray(data)) return;
                const sorted = (t: 'electricity' | 'water') =>
                    data.filter(r => r.utility_type === t).sort((a, b) => b.effective_date.localeCompare(a.effective_date));
                setElecTariff(sorted('electricity')[0] ?? null);
                setWaterTariff(sorted('water')[0] ?? null);
            })
            .catch(console.error);
    }, []);

    useEffect(() => {
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
            .catch(() => {})
            .finally(() => setLoadingConfig(false));
        loadTariffs();
        setLastUpdated(new Date().toLocaleString('id-ID'));
    }, [loadTariffs]);

    const handleSave = async () => {
        setSaving(true);
        setSaveStatus('idle');
        try {
            await fetchApi('/admin/settings', { method: 'PATCH', body: JSON.stringify(config) });
            setSaveStatus('success');
            setLastUpdated(new Date().toLocaleString('id-ID'));
        } catch {
            setSaveStatus('error');
        } finally {
            setSaving(false);
            setTimeout(() => setSaveStatus('idle'), 3000);
        }
    };

    const saveTariff = async (utilityType: 'electricity' | 'water', price: number, date: string) => {
        const existing = utilityType === 'electricity' ? elecTariff : waterTariff;
        if (existing) {
            await fetchApi(`/admin/tariff/${existing.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ price_per_unit: price, effective_date: date }),
            });
        } else {
            await fetchApi('/admin/tariff', {
                method: 'POST',
                body: JSON.stringify({ utility_type: utilityType, price_per_unit: price, effective_date: date }),
            });
        }
        loadTariffs();
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Control Center</h1>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Global tariff rates and sensor calibration settings.
                    </p>
                </div>
                {lastUpdated && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                        <Clock className="h-3.5 w-3.5" />
                        Last updated: {lastUpdated}
                    </div>
                )}
            </div>

            {/* Tariff Configuration */}
            <div className="rounded-lg bg-white dark:bg-gray-800 p-6 shadow-sm ring-1 ring-gray-900/5 dark:ring-gray-700">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">Utility Tariffs</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                    <TariffCard
                        icon={<Zap className="h-4 w-4 text-yellow-500" />}
                        label="Electricity"
                        unit="Rp/kWh"
                        tariff={elecTariff}
                        onSave={(p, d) => saveTariff('electricity', p, d)}
                    />
                    <TariffCard
                        icon={<Droplets className="h-4 w-4 text-cyan-500" />}
                        label="Water"
                        unit="Rp/m³"
                        tariff={waterTariff}
                        onSave={(p, d) => saveTariff('water', p, d)}
                    />
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
                        onClick={() => setConfig(DEFAULTS)}
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
                        <SliderField
                            label="Flow Rate Calibration Factor"
                            value={config.CAL_FACTOR_FLOWRATE}
                            min={0}
                            max={5}
                            step={0.01}
                            onChange={v => setConfig(c => ({ ...c, CAL_FACTOR_FLOWRATE: v }))}
                        />
                        <SliderField
                            label="Power Calibration Factor"
                            value={config.CAL_FACTOR_POWER}
                            min={0}
                            max={2}
                            step={0.01}
                            onChange={v => setConfig(c => ({ ...c, CAL_FACTOR_POWER: v }))}
                        />
                        <SliderField
                            label="Sensor Sampling Time"
                            value={config.SENSOR_SAMPLING_TIME}
                            min={1}
                            max={10}
                            step={1}
                            unit="s"
                            onChange={v => setConfig(c => ({ ...c, SENSOR_SAMPLING_TIME: v }))}
                        />

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
                                    <AlertCircle className="h-4 w-4" /> Save failed
                                </span>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
