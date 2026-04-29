import { Shield, Users, UserCheck, UserPlus, Trash2, Link, Unlink, Loader2, X, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { fetchApi } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Resident {
    email: string;
    name: string | null;
    picture: string | null;
    role: 'resident' | 'admin';
    created_at: string;
}

interface AdminAccount {
    email: string;
    role: 'resident' | 'admin';
    created_at: string;
}

interface Unit {
    id: number;
    unit_no: string;
    resident_email: string | null;
}

const RESIDENTS_PAGE_SIZE = 10;

export default function ManagementPage() {
    const [accounts, setAccounts] = useState<AdminAccount[]>([]);
    const [residents, setResidents] = useState<Resident[]>([]);
    const [units, setUnits] = useState<Unit[]>([]);
    const [residentsPage, setResidentsPage] = useState(1);

    const [addForm, setAddForm] = useState({ email: "", name: "" });
    const [addLoading, setAddLoading] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);
    const [showAddForm, setShowAddForm] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    const [assignTarget, setAssignTarget] = useState<string | null>(null);
    const [assignUnitId, setAssignUnitId] = useState<string>("");
    const [assignLoading, setAssignLoading] = useState(false);
    const [assignError, setAssignError] = useState<string | null>(null);

    const [toggleLoading, setToggleLoading] = useState<string | null>(null);

    const [residentSearch, setResidentSearch] = useState("");

    const loadAll = useCallback(() => {
        fetchApi('/admin/accounts').then(setAccounts).catch(() => {});
        fetchApi('/admin/residents').then(setResidents).catch(() => {});
        fetchApi('/unit').then((data: any[]) => setUnits(data.map(u => ({
            id: u.id,
            unit_no: u.unit_no,
            resident_email: u.resident_email || null,
        })))).catch(() => {});
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    const handleAddResident = async (e: React.FormEvent) => {
        e.preventDefault();
        setAddError(null);
        setAddLoading(true);
        try {
            await fetchApi('/admin/residents', {
                method: 'POST',
                body: JSON.stringify({ email: addForm.email.trim(), name: addForm.name.trim() || undefined }),
            });
            setAddForm({ email: "", name: "" });
            setShowAddForm(false);
            loadAll();
        } catch (err: any) {
            setAddError(err.message || "Failed to add resident");
        } finally {
            setAddLoading(false);
        }
    };

    const handleDeleteResident = async () => {
        if (!deleteTarget) return;
        setDeleteLoading(true);
        try {
            await fetchApi(`/admin/residents/${encodeURIComponent(deleteTarget)}`, { method: 'DELETE' });
            setDeleteTarget(null);
            loadAll();
        } catch (err: any) {
            setAddError(err.message?.replace(/^API error \(\d+\): /, '') || "Failed to delete resident");
        } finally {
            setDeleteLoading(false);
        }
    };

    const handleAssignUnit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!assignTarget || !assignUnitId) return;
        setAssignError(null);
        setAssignLoading(true);
        try {
            await fetchApi(`/admin/residents/${encodeURIComponent(assignTarget)}/units/${assignUnitId}`, { method: 'POST' });
            setAssignTarget(null);
            setAssignUnitId("");
            loadAll();
        } catch (err: any) {
            setAssignError(err.message || "Failed to assign unit");
        } finally {
            setAssignLoading(false);
        }
    };

    const handleUnassignUnit = async (email: string, unitId: number) => {
        try {
            await fetchApi(`/admin/residents/${encodeURIComponent(email)}/units/${unitId}`, { method: 'DELETE' });
            loadAll();
        } catch (err: any) {
            setAddError(err.message?.replace(/^API error \(\d+\): /, '') || "Failed to unassign unit");
        }
    };

    const handleToggleAccount = async (email: string, currentRole: string) => {
        setToggleLoading(email);
        try {
            await fetchApi(`/admin/accounts/${encodeURIComponent(email)}/access`, {
                method: 'PATCH',
                body: JSON.stringify({ enabled: currentRole !== 'admin' }),
            });
            loadAll();
        } catch (err: any) {
            setAddError(err.message?.replace(/^API error \(\d+\): /, '') || "Failed to update account");
        } finally {
            setToggleLoading(null);
        }
    };

    const unassignedUnits = units.filter(u => u.resident_email === null);
    const residentUnits = (email: string) => units.filter(u => u.resident_email === email);

    const filteredResidents = residents.filter(r =>
        residentSearch === "" ||
        r.email.toLowerCase().includes(residentSearch.toLowerCase()) ||
        (r.name ?? "").toLowerCase().includes(residentSearch.toLowerCase())
    );

    const totalResidentPages = Math.max(1, Math.ceil(filteredResidents.length / RESIDENTS_PAGE_SIZE));
    const residentPageData = filteredResidents.slice((residentsPage - 1) * RESIDENTS_PAGE_SIZE, residentsPage * RESIDENTS_PAGE_SIZE);

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-gray-900">System Management</h1>

            {/* Admin Accounts */}
            <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-900/5">
                <div className="mb-4 flex items-center space-x-3">
                    <div className="rounded-lg bg-indigo-50 p-2">
                        <Shield className="h-6 w-6 text-indigo-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Admin Accounts</h2>
                        <p className="text-xs text-gray-500">Accounts with Google OAuth admin access.</p>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                            <tr>
                                <th className="px-4 py-2 font-medium">Email</th>
                                <th className="px-4 py-2 font-medium">Name</th>
                                <th className="px-4 py-2 font-medium">Since</th>
                                <th className="px-4 py-2 font-medium text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {accounts.length === 0 && (
                                <tr><td colSpan={4} className="px-4 py-4 text-center text-gray-400 text-xs">No admin accounts.</td></tr>
                            )}
                            {accounts.map((acc) => (
                                <tr key={acc.email} className="hover:bg-gray-50">
                                    <td className="px-4 py-2 font-medium text-gray-900">{acc.email}</td>
                                    <td className="px-4 py-2 text-gray-500">{(acc as any).name || "—"}</td>
                                    <td className="px-4 py-2 text-gray-400 text-xs">{new Date(acc.created_at).toLocaleDateString()}</td>
                                    <td className="px-4 py-2 text-right">
                                        <button
                                            onClick={() => handleToggleAccount(acc.email, acc.role)}
                                            disabled={toggleLoading === acc.email}
                                            className="rounded-md border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                                        >
                                            {toggleLoading === acc.email ? <Loader2 className="h-3 w-3 animate-spin inline" /> : "Revoke Admin"}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Residents Table */}
            <div className="rounded-lg bg-white shadow-sm ring-1 ring-gray-900/5">
                <div className="border-b border-gray-200 px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className="rounded-lg bg-blue-50 p-2">
                                <UserCheck className="h-6 w-6 text-blue-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">Registered Residents</h2>
                                <p className="text-xs text-gray-500">{residents.length} total</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <input
                                type="text"
                                placeholder="Search..."
                                value={residentSearch}
                                onChange={e => { setResidentSearch(e.target.value); setResidentsPage(1); }}
                                className="h-8 w-48 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                            />
                            <button
                                onClick={() => setShowAddForm(v => !v)}
                                className="flex items-center space-x-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90"
                            >
                                <UserPlus className="h-3.5 w-3.5" />
                                <span>Add</span>
                            </button>
                        </div>
                    </div>

                    {showAddForm && (
                        <form onSubmit={handleAddResident} className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3 space-y-2">
                            {addError && <p className="text-xs text-red-600">{addError}</p>}
                            <div className="grid grid-cols-2 gap-2">
                                <input required type="email" placeholder="Email address *" value={addForm.email}
                                    maxLength={255}
                                    onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
                                <input type="text" placeholder="Display name (optional)" value={addForm.name}
                                    maxLength={100}
                                    onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
                            </div>
                            <div className="flex justify-end space-x-2">
                                <button type="button" onClick={() => { setShowAddForm(false); setAddError(null); }} className="rounded-md border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-100">Cancel</button>
                                <button type="submit" disabled={addLoading} className="flex items-center space-x-1 rounded-md bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-60">
                                    {addLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                    <span>Save</span>
                                </button>
                            </div>
                        </form>
                    )}
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-500">
                        <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                            <tr>
                                <th className="px-6 py-3 font-medium">Resident</th>
                                <th className="px-6 py-3 font-medium">Units Assigned</th>
                                <th className="px-6 py-3 font-medium">Joined</th>
                                <th className="px-6 py-3 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {residentPageData.length === 0 && (
                                <tr><td colSpan={4} className="px-6 py-6 text-center text-gray-400">No residents found.</td></tr>
                            )}
                            {residentPageData.map((res) => {
                                const assigned = residentUnits(res.email);
                                return (
                                    <tr key={res.email} className="hover:bg-gray-50">
                                        <td className="px-6 py-3">
                                            <div className="flex items-center gap-3">
                                                {res.picture ? (
                                                    <img src={res.picture} alt="" className="h-8 w-8 rounded-full shrink-0" />
                                                ) : (
                                                    <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                                                        <Users className="h-4 w-4 text-gray-400" />
                                                    </div>
                                                )}
                                                <div>
                                                    <div className="font-medium text-gray-900">{res.name || "—"}</div>
                                                    <div className="text-xs text-gray-400">{res.email}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-3">
                                            <div className="flex flex-wrap gap-1">
                                                {assigned.length === 0 && <span className="text-xs text-gray-400">None</span>}
                                                {assigned.map(u => (
                                                    <span key={u.id} className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs text-blue-700">
                                                        {u.unit_no}
                                                        <button onClick={() => handleUnassignUnit(res.email, u.id)} className="text-blue-400 hover:text-red-500">
                                                            <X className="h-3 w-3" />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-6 py-3 text-xs text-gray-400">{new Date(res.created_at).toLocaleDateString()}</td>
                                        <td className="px-6 py-3 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    onClick={() => { setAssignTarget(res.email); setAssignUnitId(""); setAssignError(null); }}
                                                    className="rounded-md border border-blue-200 p-1.5 text-blue-600 hover:bg-blue-50"
                                                    title="Assign unit"
                                                >
                                                    <Link className="h-3.5 w-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => setDeleteTarget(res.email)}
                                                    className="rounded-md border border-red-200 p-1.5 text-red-500 hover:bg-red-50"
                                                    title="Delete resident"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between border-t border-gray-200 px-6 py-3">
                    <span className="text-xs text-gray-400">
                        {filteredResidents.length === 0 ? "No results" : `Showing ${Math.min((residentsPage - 1) * RESIDENTS_PAGE_SIZE + 1, filteredResidents.length)}–${Math.min(residentsPage * RESIDENTS_PAGE_SIZE, filteredResidents.length)} of ${filteredResidents.length}`}
                    </span>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setResidentsPage(p => Math.max(1, p - 1))} disabled={residentsPage === 1}
                            className={cn("flex items-center rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed")}>
                            <ChevronLeft className="h-3.5 w-3.5 mr-0.5" /> Prev
                        </button>
                        <span className="text-xs text-gray-500">{residentsPage} / {totalResidentPages}</span>
                        <button onClick={() => setResidentsPage(p => Math.min(totalResidentPages, p + 1))} disabled={residentsPage === totalResidentPages}
                            className={cn("flex items-center rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed")}>
                            Next <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Assign Unit Modal */}
            {assignTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="w-full max-w-sm rounded-lg bg-white shadow-xl ring-1 ring-gray-900/5 p-6">
                        <h3 className="text-base font-semibold text-gray-900">Assign Unit</h3>
                        <p className="mt-1 text-sm text-gray-500">Assign a unit to <strong>{assignTarget}</strong></p>
                        <form onSubmit={handleAssignUnit} className="mt-4 space-y-3">
                            {assignError && <p className="text-xs text-red-600">{assignError}</p>}
                            <select required value={assignUnitId} onChange={e => setAssignUnitId(e.target.value)}
                                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
                                <option value="">Select unit...</option>
                                {unassignedUnits.map(u => <option key={u.id} value={u.id}>{u.unit_no}</option>)}
                            </select>
                            {unassignedUnits.length === 0 && <p className="text-xs text-gray-400">All units are already assigned.</p>}
                            <div className="flex justify-end space-x-2">
                                <button type="button" onClick={() => setAssignTarget(null)} className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                                <button type="submit" disabled={assignLoading || unassignedUnits.length === 0}
                                    className="flex items-center space-x-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60">
                                    {assignLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                                    <span>Assign</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Resident Confirm */}
            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="w-full max-w-sm rounded-lg bg-white shadow-xl ring-1 ring-gray-900/5 p-6">
                        <h3 className="text-base font-semibold text-gray-900">Delete Resident</h3>
                        <p className="mt-2 text-sm text-gray-500">Remove <strong>{deleteTarget}</strong> from the system? Their unit assignments will also be cleared.</p>
                        <div className="mt-4 flex justify-end space-x-3">
                            <button onClick={() => setDeleteTarget(null)} disabled={deleteLoading} className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-60">Cancel</button>
                            <button onClick={handleDeleteResident} disabled={deleteLoading} className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">
                                {deleteLoading ? "Deleting..." : "Delete"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
