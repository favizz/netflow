import { Shield, Users, UserCheck, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchApi } from "@/lib/api";

const PAGE_SIZE = 10;

function Pagination({
    page, totalPages, onPrev, onNext,
}: { page: number; totalPages: number; onPrev: () => void; onNext: () => void }) {
    return (
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100 dark:border-gray-700 mt-3">
            <button onClick={onPrev} disabled={page === 1}
                className="flex items-center rounded-md border border-gray-200 dark:border-gray-600 px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed">
                <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Prev
            </button>
            <span className="text-xs text-gray-500 dark:text-gray-400">{page} / {totalPages}</span>
            <button onClick={onNext} disabled={page === totalPages}
                className="flex items-center rounded-md border border-gray-200 dark:border-gray-600 px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed">
                Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </button>
        </div>
    );
}

export default function UsersPage() {
    const navigate = useNavigate();
    const [accounts, setAccounts] = useState<any[]>([]);
    const [residents, setResidents] = useState<any[]>([]);
    const [accountPage, setAccountPage] = useState(1);
    const [residentPage, setResidentPage] = useState(1);

    useEffect(() => {
        fetchApi('/admin/accounts')
            .then(data => setAccounts(Array.isArray(data) ? data : []))
            .catch(console.error);

        fetchApi('/admin/residents')
            .then(data => setResidents(Array.isArray(data) ? data : []))
            .catch(console.error);
    }, []);

    const accountPages = Math.max(1, Math.ceil(accounts.length / PAGE_SIZE));
    const residentPages = Math.max(1, Math.ceil(residents.length / PAGE_SIZE));

    const pagedAccounts = accounts.slice((accountPage - 1) * PAGE_SIZE, accountPage * PAGE_SIZE);
    const pagedResidents = residents.slice((residentPage - 1) * PAGE_SIZE, residentPage * PAGE_SIZE);

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Users</h1>

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Admin Accounts */}
                <div className="rounded-lg bg-white dark:bg-gray-800 p-6 shadow-sm ring-1 ring-gray-900/5 dark:ring-gray-700">
                    <div className="mb-4 flex items-center space-x-3">
                        <div className="rounded-lg bg-indigo-50 dark:bg-indigo-900/30 p-2">
                            <Shield className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Admin Accounts</h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{accounts.length} account{accounts.length !== 1 ? 's' : ''}</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        {accounts.length === 0 && (
                            <p className="text-sm text-gray-400 dark:text-gray-500">Loading accounts...</p>
                        )}
                        {pagedAccounts.map((acc: any) => (
                            <div key={acc.email} className="flex items-center justify-between rounded-md border border-gray-100 dark:border-gray-700 p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                <div className="flex items-center space-x-3">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/30">
                                        <Users className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                                    </div>
                                    <div>
                                        <span className="font-medium text-gray-900 dark:text-gray-100 block text-sm">{acc.email}</span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">{acc.role}</span>
                                    </div>
                                </div>
                                <span className={`text-xs font-medium px-2 py-1 rounded-full ${acc.enabled ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400" : "bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400"}`}>
                                    {acc.enabled ? "Active" : "Disabled"}
                                </span>
                            </div>
                        ))}
                    </div>

                    {accounts.length > PAGE_SIZE && (
                        <Pagination
                            page={accountPage}
                            totalPages={accountPages}
                            onPrev={() => setAccountPage(p => Math.max(1, p - 1))}
                            onNext={() => setAccountPage(p => Math.min(accountPages, p + 1))}
                        />
                    )}
                </div>

                {/* Residents */}
                <div className="rounded-lg bg-white dark:bg-gray-800 p-6 shadow-sm ring-1 ring-gray-900/5 dark:ring-gray-700">
                    <div className="mb-4 flex items-center space-x-3">
                        <div className="rounded-lg bg-primary/10 dark:bg-primary/20 p-2">
                            <UserCheck className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Registered Residents</h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{residents.length} resident{residents.length !== 1 ? 's' : ''}</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        {residents.length === 0 && (
                            <p className="text-sm text-gray-400 dark:text-gray-500">No residents registered yet.</p>
                        )}
                        {pagedResidents.map((res: any) => (
                            <div key={res.email} className="flex items-center justify-between rounded-md border border-gray-100 dark:border-gray-700 p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                <div className="flex items-center space-x-3">
                                    {res.picture ? (
                                        <img src={res.picture} alt="" className="h-8 w-8 rounded-full object-cover" referrerPolicy="no-referrer" />
                                    ) : (
                                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
                                            <Users className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                                        </div>
                                    )}
                                    <div>
                                        <span className="font-medium text-gray-900 dark:text-gray-100 block text-sm">{res.name || "Unknown Name"}</span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">{res.email}</span>
                                        {res.unit_no && (
                                            <span className="ml-1 text-xs font-medium text-primary">· {res.unit_no}</span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-400 dark:text-gray-500">
                                        {res.created_at ? new Date(res.created_at).toLocaleDateString('id-ID') : '—'}
                                    </span>
                                    {res.unit_no && (
                                        <button
                                            onClick={() => navigate(`/devices?unit=${encodeURIComponent(res.unit_no)}`)}
                                            title={`View device for ${res.unit_no}`}
                                            className="flex items-center gap-1 rounded-md border border-gray-200 dark:border-gray-600 px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                        >
                                            <ExternalLink className="h-3 w-3" />
                                            Device
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {residents.length > PAGE_SIZE && (
                        <Pagination
                            page={residentPage}
                            totalPages={residentPages}
                            onPrev={() => setResidentPage(p => Math.max(1, p - 1))}
                            onNext={() => setResidentPage(p => Math.min(residentPages, p + 1))}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
