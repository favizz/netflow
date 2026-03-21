import { Download, Shield, Users, RefreshCw } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export default function ManagementPage() {
    const [updating, setUpdating] = useState(false);

    const handleOTA = () => {
        setUpdating(true);
        setTimeout(() => setUpdating(false), 3000);
    };

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-gray-900">System Management</h1>

            <div className="grid gap-6 lg:grid-cols-2">
                {/* RBAC Section */}
                <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-900/5">
                    <div className="mb-4 flex items-center space-x-3">
                        <div className="rounded-lg bg-indigo-50 p-2">
                            <Shield className="h-6 w-6 text-indigo-600" />
                        </div>
                        <h2 className="text-lg font-semibold text-gray-900">Access Control (RBAC)</h2>
                    </div>
                    <p className="mb-4 text-sm text-gray-500">Manage user roles and permissions.</p>

                    <div className="space-y-4">
                        {['Financial Admin', 'Field Technician', 'General Manager'].map((role) => (
                            <div key={role} className="flex items-center justify-between rounded-md border border-gray-100 p-3">
                                <div className="flex items-center space-x-3">
                                    <Users className="h-5 w-5 text-gray-400" />
                                    <span className="font-medium text-gray-900">{role}</span>
                                </div>
                                <button className="text-sm font-medium text-primary hover:text-primary/80">Edit Permissions</button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* OTA Update Section */}
                <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-900/5">
                    <div className="mb-4 flex items-center space-x-3">
                        <div className="rounded-lg bg-purple-50 p-2">
                            <Download className="h-6 w-6 text-purple-600" />
                        </div>
                        <h2 className="text-lg font-semibold text-gray-900">Firmware Updates (OTA)</h2>
                    </div>
                    <p className="mb-6 text-sm text-gray-500">Latest version: <span className="font-mono font-medium text-gray-900">v2.4.1 (Stable)</span></p>

                    <div className="rounded-md bg-gray-50 p-4 mb-6">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">Target Devices</span>
                            <span className="font-medium text-gray-900">2,444 Smart Meters</span>
                        </div>
                        <div className="mt-2 h-2 w-full rounded-full bg-gray-200">
                            <div className="h-2 w-3/4 rounded-full bg-green-500"></div>
                        </div>
                        <div className="mt-1 flex justify-between text-xs text-gray-500">
                            <span>Update Coverage: 75%</span>
                            <span>Signal Strength: Good</span>
                        </div>
                    </div>

                    <button
                        onClick={handleOTA}
                        disabled={updating}
                        className={cn(
                            "flex w-full items-center justify-center space-x-2 rounded-md py-2.5 text-sm font-semibold text-white shadow-sm transition-all",
                            updating ? "bg-gray-400 cursor-not-allowed" : "bg-primary hover:bg-primary/90"
                        )}
                    >
                        {updating ? (
                            <>
                                <RefreshCw className="h-4 w-4 animate-spin" />
                                <span>Deploying Updates...</span>
                            </>
                        ) : (
                            <>
                                <Download className="h-4 w-4" />
                                <span>Trigger OTA Update</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
