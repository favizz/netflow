import { Shield, Users, UserCheck } from "lucide-react";
import { useState, useEffect } from "react";
import { fetchApi } from "@/lib/api";

export default function ManagementPage() {
    const [accounts, setAccounts] = useState<any[]>([]);
    const [residents, setResidents] = useState<any[]>([]);

    useEffect(() => {
        fetchApi('/admin/accounts')
            .then(data => setAccounts(data))
            .catch(console.error);
            
        fetchApi('/admin/residents')
            .then(data => setResidents(data))
            .catch(console.error);
    }, []);

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
                    <p className="mb-4 text-sm text-gray-500">Admin accounts with API key access.</p>

                    <div className="space-y-4">
                        {accounts.length === 0 && (
                            <p className="text-sm text-gray-400">Loading accounts...</p>
                        )}
                        {accounts.map((acc: any) => (
                            <div key={acc.email} className="flex items-center justify-between rounded-md border border-gray-100 p-3">
                                <div className="flex items-center space-x-3">
                                    <Users className="h-5 w-5 text-gray-400" />
                                    <div>
                                        <span className="font-medium text-gray-900 block">{acc.email}</span>
                                        <span className="text-xs text-gray-500 uppercase">{acc.role}</span>
                                    </div>
                                </div>
                                <span className={`text-sm font-medium ${acc.enabled ? "text-green-600" : "text-red-500"}`}>
                                    {acc.enabled ? "Active" : "Disabled"}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Residents Section */}
                <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-900/5">
                    <div className="mb-4 flex items-center space-x-3">
                        <div className="rounded-lg bg-blue-50 p-2">
                            <UserCheck className="h-6 w-6 text-blue-600" />
                        </div>
                        <h2 className="text-lg font-semibold text-gray-900">Registered Residents</h2>
                    </div>
                    <p className="mb-4 text-sm text-gray-500">Residents registered via Google OAuth.</p>

                    <div className="space-y-4">
                        {residents.length === 0 && (
                            <p className="text-sm text-gray-400">No residents registered yet.</p>
                        )}
                        {residents.map((res: any) => (
                            <div key={res.email} className="flex items-center justify-between rounded-md border border-gray-100 p-3">
                                <div className="flex items-center space-x-3">
                                    {res.picture ? (
                                        <img src={res.picture} alt="" className="h-8 w-8 rounded-full" />
                                    ) : (
                                        <Users className="h-8 w-8 text-gray-400 bg-gray-100 rounded-full p-1.5" />
                                    )}
                                    <div>
                                        <span className="font-medium text-gray-900 block">{res.name || "Unknown Name"}</span>
                                        <span className="text-xs text-gray-500">{res.email}</span>
                                    </div>
                                </div>
                                <span className="text-xs text-gray-500">
                                    {new Date(res.created_at).toLocaleDateString()}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
