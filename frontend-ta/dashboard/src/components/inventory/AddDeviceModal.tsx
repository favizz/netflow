import { useState, useEffect, useRef } from "react";
import { X, Check, Loader2, ChevronRight, ChevronLeft, Search } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { useToast } from "@/components/layout/ToastProvider";

interface AddDeviceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export function AddDeviceModal({ isOpen, onClose, onSuccess }: AddDeviceModalProps) {
    const [step, setStep] = useState(1);
    
    // Step 1 data
    const [buildings, setBuildings] = useState<{id: number, code: string, name: string}[]>([]);
    const [selectedBuildingId, setSelectedBuildingId] = useState<number | null>(null);
    const [loadingBuildings, setLoadingBuildings] = useState(false);

    // Step 2 data
    const [formData, setFormData] = useState({ unit_no: "", device_id: "", balance: "0" });
    
    // Step 3 data
    const [residents, setResidents] = useState<{email: string, name: string}[]>([]);
    const [selectedResident, setSelectedResident] = useState<string>("");
    const [loadingResidents, setLoadingResidents] = useState(false);

    const [residentSearch, setResidentSearch] = useState("");
    const [residentDropdownOpen, setResidentDropdownOpen] = useState(false);
    const residentSearchRef = useRef<HTMLInputElement>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const toast = useToast();

    useEffect(() => {
        if (isOpen) {
            setStep(1);
            setFormData({ unit_no: "", device_id: "", balance: "0" });
            setSelectedBuildingId(null);
            setSelectedResident("");
            setResidentSearch("");
            setResidentDropdownOpen(false);
            setError(null);
            
            // Fetch buildings
            setLoadingBuildings(true);
            fetchApi('/admin/buildings')
                .then(data => setBuildings(data || []))
                .catch(() => setBuildings([]))
                .finally(() => setLoadingBuildings(false));
                
            // Fetch residents
            setLoadingResidents(true);
            fetchApi('/admin/residents')
                .then(data => setResidents(data || []))
                .catch(() => setResidents([]))
                .finally(() => setLoadingResidents(false));
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleNext = () => {
        if (step === 1 && !selectedBuildingId) {
            setError("Please select a building.");
            return;
        }
        if (step === 2 && (!formData.unit_no || !formData.device_id)) {
            setError("Please fill all required fields.");
            return;
        }
        setError(null);
        setStep(s => s + 1);
    };

    const handleBack = () => {
        setError(null);
        setStep(s => s - 1);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            // 1. Create Unit
            const unitRes = await fetchApi('/unit', {
                method: 'POST',
                body: JSON.stringify({
                    building_id: selectedBuildingId,
                    unit_no: formData.unit_no.trim().toUpperCase(),
                    device_id: formData.device_id.trim().toUpperCase(),
                    balance: parseFloat(formData.balance) || 0,
                }),
            });

            // 2. Assign Resident if selected
            if (selectedResident && unitRes?.id) {
                await fetchApi(`/admin/residents/${encodeURIComponent(selectedResident)}/units/${unitRes.id}`, {
                    method: 'POST'
                });
            }

            toast.success(`Unit ${formData.unit_no} registered successfully.`);
            onSuccess();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create unit");
        } finally {
            setLoading(false);
        }
    };

    const steps = [
        { id: 1, name: "Building" },
        { id: 2, name: "Device Info" },
        { id: 3, name: "Assign (Optional)" }
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg rounded-lg bg-white dark:bg-gray-800 shadow-xl ring-1 ring-gray-900/5 dark:ring-gray-700 overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 p-4 shrink-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Register New Unit</h3>
                    <button onClick={onClose} className="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Stepper */}
                <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700 shrink-0">
                    <nav aria-label="Progress">
                        <ol role="list" className="flex items-center justify-between">
                            {steps.map((s, idx) => (
                                <li key={s.name} className={idx !== steps.length - 1 ? "pr-8 sm:pr-20" : ""}>
                                    <div className="flex flex-col items-start">
                                        <span className={`text-xs font-semibold uppercase tracking-wide ${step === s.id ? "text-primary" : step > s.id ? "text-green-600 dark:text-green-500" : "text-gray-400"}`}>
                                            Step {s.id}
                                        </span>
                                        <span className={`text-sm font-medium ${step === s.id ? "text-gray-900 dark:text-gray-100" : "text-gray-500"}`}>
                                            {s.name}
                                        </span>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </nav>
                </div>

                <div className="p-6 overflow-y-auto">
                    {error && (
                        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                            {error}
                        </div>
                    )}

                    {step === 1 && (
                        <div className="space-y-4">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Select Building <span className="text-red-500">*</span>
                            </label>
                            {loadingBuildings ? (
                                <div className="flex items-center text-sm text-gray-500"><Loader2 className="w-4 h-4 mr-2 animate-spin"/> Loading buildings...</div>
                            ) : buildings.length === 0 ? (
                                <p className="text-sm text-gray-500">No buildings available. The default building will be used if none exist.</p>
                            ) : (
                                <div className="grid gap-3">
                                    {buildings.map(b => (
                                        <label key={b.id} className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${selectedBuildingId === b.id ? 'border-primary bg-primary/5 dark:bg-primary/10' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}>
                                            <input type="radio" name="building" className="h-4 w-4 text-primary border-gray-300 focus:ring-primary" 
                                                checked={selectedBuildingId === b.id} onChange={() => setSelectedBuildingId(b.id)} />
                                            <span className="ml-3 font-medium text-gray-900 dark:text-gray-100">{b.name} <span className="text-gray-500 font-normal">({b.code})</span></span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Unit Number <span className="text-red-500">*</span>
                                </label>
                                <input
                                    required
                                    type="text"
                                    value={formData.unit_no}
                                    onChange={(e) => setFormData({ ...formData, unit_no: e.target.value })}
                                    maxLength={20}
                                    className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                    placeholder="e.g. TOWER-A-101"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Device ID / MAC Address <span className="text-red-500">*</span>
                                </label>
                                <input
                                    required
                                    type="text"
                                    value={formData.device_id}
                                    onChange={(e) => setFormData({ ...formData, device_id: e.target.value })}
                                    maxLength={100}
                                    className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                    placeholder="e.g. DEV-A101-MAC"
                                />
                                <p className="mt-1 text-xs text-gray-500">Must exactly match the hardware identifier.</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Initial Balance (Rp)
                                </label>
                                <input
                                    type="number"
                                    step="1"
                                    min="0"
                                    value={formData.balance}
                                    onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
                                    className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-4">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Assign Resident (Optional)
                            </label>
                            {loadingResidents ? (
                                <div className="flex items-center text-sm text-gray-500"><Loader2 className="w-4 h-4 mr-2 animate-spin"/> Loading users...</div>
                            ) : (
                                <div className="relative">
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
                                        <input
                                            ref={residentSearchRef}
                                            type="text"
                                            value={residentSearch}
                                            onFocus={() => setResidentDropdownOpen(true)}
                                            onChange={(e) => { setResidentSearch(e.target.value); setResidentDropdownOpen(true); }}
                                            placeholder={selectedResident ? residents.find(r => r.email === selectedResident)?.name || selectedResident : "Search resident..."}
                                            className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 pl-9 pr-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                        />
                                    </div>
                                    {residentDropdownOpen && (
                                        <div className="absolute z-10 mt-1 w-full max-h-48 overflow-auto rounded-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 shadow-lg">
                                            <button
                                                type="button"
                                                onMouseDown={(e) => { e.preventDefault(); setSelectedResident(""); setResidentSearch(""); setResidentDropdownOpen(false); }}
                                                className="w-full text-left px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 italic"
                                            >
                                                — No assignment yet —
                                            </button>
                                            {residents
                                                .filter(r => {
                                                    const q = residentSearch.toLowerCase();
                                                    return !q || r.email.toLowerCase().includes(q) || (r.name || '').toLowerCase().includes(q);
                                                })
                                                .map(r => (
                                                    <button
                                                        key={r.email}
                                                        type="button"
                                                        onMouseDown={(e) => { e.preventDefault(); setSelectedResident(r.email); setResidentSearch(""); setResidentDropdownOpen(false); }}
                                                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${selectedResident === r.email ? 'bg-primary/10 text-primary font-medium' : 'text-gray-900 dark:text-gray-100'}`}
                                                    >
                                                        <span className="font-medium">{r.name || r.email}</span>
                                                        {r.name && <span className="ml-1 text-gray-400 text-xs">{r.email}</span>}
                                                    </button>
                                                ))
                                            }
                                        </div>
                                    )}
                                </div>
                            )}
                            {selectedResident && (
                                <div className="flex items-center justify-between rounded-md bg-primary/5 dark:bg-primary/10 border border-primary/20 px-3 py-2">
                                    <span className="text-sm text-primary font-medium">{residents.find(r => r.email === selectedResident)?.name || selectedResident}</span>
                                    <button type="button" onClick={() => { setSelectedResident(""); setResidentSearch(""); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                            <p className="text-xs text-gray-500">You can also assign this later from the Users page.</p>
                        </div>
                    )}
                </div>

                <div className="border-t border-gray-100 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900/50 flex justify-between shrink-0">
                    <button
                        type="button"
                        onClick={step === 1 ? onClose : handleBack}
                        disabled={loading}
                        className="flex items-center rounded-md border border-gray-200 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                    >
                        {step === 1 ? "Cancel" : <><ChevronLeft className="w-4 h-4 mr-1"/> Back</>}
                    </button>
                    
                    {step < 3 ? (
                        <button
                            type="button"
                            onClick={handleNext}
                            className="flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
                        >
                            Next <ChevronRight className="w-4 h-4 ml-1"/>
                        </button>
                    ) : (
                        <button
                            onClick={handleSubmit}
                            disabled={loading}
                            className="flex items-center space-x-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-60"
                        >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            <span>Register Unit</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
