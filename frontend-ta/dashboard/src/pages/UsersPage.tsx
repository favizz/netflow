import { useState, useEffect, useCallback } from "react";
import { Users, UserPlus, Trash2, Link, ChevronLeft, ChevronRight, Search, Loader2, Check, X, Shield } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { getAdminEmail } from "@/lib/auth";
import { useToast } from "@/components/layout/ToastProvider";

const PAGE_SIZE = 10;

interface Resident {
    email: string;
    name: string | null;
    picture: string | null;
    role: 'resident' | 'admin';
    created_at: string;
}

interface Unit {
    id: number;
    unit_no: string;
    resident_email: string | null;
}

function ConfirmModal({ title, message, confirmLabel, danger, onConfirm, onCancel, loading }: {
    title: string;
    message: React.ReactNode;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    loading?: boolean;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-lg bg-white dark:bg-gray-800 shadow-xl ring-1 ring-gray-900/5 dark:ring-gray-700 p-6">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
                <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">{message}</div>
                <div className="mt-5 flex justify-end gap-3">
                    <button onClick={onCancel} disabled={loading}
                        className="rounded-md border border-gray-200 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
                        Cancel
                    </button>
                    <button onClick={onConfirm} disabled={loading}
                        className={cn("flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60", danger ? "bg-red-600 hover:bg-red-700" : "bg-primary hover:bg-primary/90")}>
                        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function UsersPage() {
    const [residents, setResidents] = useState<Resident[]>([]);
    const [units, setUnits] = useState<Unit[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'resident'>('all');
    const [page, setPage] = useState(1);
    const adminEmail = getAdminEmail();
    const toast = useToast();

    const [showAddForm, setShowAddForm] = useState(false);
    const [addForm, setAddForm] = useState({ email: '', name: '' });
    const [addLoading, setAddLoading] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);

    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const [assignTarget, setAssignTarget] = useState<string | null>(null);
    const [assignUnitId, setAssignUnitId] = useState('');
    const [assignLoading, setAssignLoading] = useState(false);
    const [assignError, setAssignError] = useState<string | null>(null);

    const [unassignTarget, setUnassignTarget] = useState<{ email: string, unitId: number, unitNo: string } | null>(null);
    const [unassignLoading, setUnassignLoading] = useState(false);

    const [toggleTarget, setToggleTarget] = useState<Resident | null>(null);
    const [toggleLoading, setToggleLoading] = useState(false);

    const [inlineError, setInlineError] = useState<string | null>(null);

    const loadAll = useCallback(() => {
        setLoading(true);
        Promise.all([
            fetchApi('/admin/residents').catch(() => []),
            fetchApi('/unit').catch(() => []),
        ]).then(([res, unitData]) => {
            setResidents(Array.isArray(res) ? res : []);
            setUnits(Array.isArray(unitData) ? unitData.map((u: { id: number; unit_no: string; resident_email: string | null; }) => ({ id: u.id, unit_no: u.unit_no, resident_email: u.resident_email || null })) : []);
        }).finally(() => setLoading(false));
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    const unassignedUnits = units.filter(u => u.resident_email === null);
    const residentUnits = (email: string) => units.filter(u => u.resident_email === email);

    const filtered = residents.filter(r => {
        const q = search.toLowerCase();
        const assignedUnits = residentUnits(r.email).map(u => u.unit_no.toLowerCase());
        const matchSearch = !q ||
            r.email.toLowerCase().includes(q) ||
            (r.name ?? '').toLowerCase().includes(q) ||
            r.role.toLowerCase().includes(q) ||
            assignedUnits.some(u => u.includes(q));
        const matchRole = roleFilter === 'all' || r.role === roleFilter;
        return matchSearch && matchRole;
    });

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const handleAddResident = async (e: React.FormEvent) => {
        e.preventDefault();
        setAddError(null);
        setAddLoading(true);
        try {
            await fetchApi('/admin/residents', {
                method: 'POST',
                body: JSON.stringify({ email: addForm.email.trim(), name: addForm.name.trim() || undefined }),
            });
            toast.success(`User ${addForm.email} added successfully`);
            setAddForm({ email: '', name: '' });
            setShowAddForm(false);
            loadAll();
        } catch (err) {
            setAddError(err instanceof Error ? err.message.replace(/^API error \(\d+\): /, '') : 'Could not add resident. Check the email and try again.');
        } finally {
            setAddLoading(false);
        }
    };

    const handleDeleteConfirm = async () => {
        if (!deleteTarget) return;
        setDeleteLoading(true);
        setDeleteError(null);
        try {
            await fetchApi(`/admin/residents/${encodeURIComponent(deleteTarget)}`, { method: 'DELETE' });
            toast.success(`User ${deleteTarget} deleted successfully`);
            setDeleteTarget(null);
            loadAll();
        } catch (err) {
            setDeleteError(err instanceof Error ? err.message.replace(/^API error \(\d+\): /, '') : 'Could not delete resident.');
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
            toast.success(`Unit assigned to ${assignTarget} successfully`);
            setAssignTarget(null);
            setAssignUnitId('');
            loadAll();
        } catch (err) {
            setAssignError(err instanceof Error ? err.message.replace(/^API error \(\d+\): /, '') : 'Could not assign unit.');
        } finally {
            setAssignLoading(false);
        }
    };

    const handleUnassignConfirm = async () => {
        if (!unassignTarget) return;
        setInlineError(null);
        setUnassignLoading(true);
        try {
            await fetchApi(`/admin/residents/${encodeURIComponent(unassignTarget.email)}/units/${unassignTarget.unitId}`, { method: 'DELETE' });
            toast.success(`Unit ${unassignTarget.unitNo} unassigned from ${unassignTarget.email}`);
            setUnassignTarget(null);
            loadAll();
        } catch (err) {
            setInlineError(err instanceof Error ? err.message.replace(/^API error \(\d+\): /, '') : 'Could not unassign unit.');
        } finally {
            setUnassignLoading(false);
        }
    };

    const handleToggleRole = async () => {
        if (!toggleTarget) return;
        setToggleLoading(true);
        try {
            await fetchApi(`/admin/accounts/${encodeURIComponent(toggleTarget.email)}/access`, {
                method: 'PATCH',
                body: JSON.stringify({ enabled: toggleTarget.role !== 'admin' }),
            });
            toast.success(`Role updated successfully for ${toggleTarget.email}`);
            setToggleTarget(null);
            loadAll();
        } catch (err) {
            setInlineError(err instanceof Error ? err.message.replace(/^API error \(\d+\): /, '') : 'Could not update role.');
            setToggleTarget(null);
        } finally {
            setToggleLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Users</h1>

            {inlineError && (
                <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 flex items-center justify-between">
                    <span className="text-sm text-red-700 dark:text-red-400">{inlineError}</span>
                    <button onClick={() => setInlineError(null)} className="text-red-400 hover:text-red-600"><X className="h-4 w-4" /></button>
                </div>
            )}

            <div className="rounded-lg bg-white dark:bg-gray-800 shadow-sm ring-1 ring-gray-900/5 dark:ring-gray-700 overflow-hidden">
                <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                            <Users className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{residents.length} users total</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search name, email, unit..."
                                    value={search}
                                    onChange={e => { setSearch(e.target.value); setPage(1); }}
                                    className="h-9 w-56 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 pl-9 pr-4 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-gray-400 dark:placeholder:text-gray-500"
                                />
                            </div>
                            <select
                                value={roleFilter}
                                onChange={e => { setRoleFilter(e.target.value as 'all' | 'admin' | 'resident'); setPage(1); }}
                                className="h-9 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 text-sm text-gray-700 dark:text-gray-300 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                            >
                                <option value="all">All roles</option>
                                <option value="admin">Admin only</option>
                                <option value="resident">Resident only</option>
                            </select>
                            <button
                                onClick={() => { setShowAddForm(v => !v); setAddError(null); }}
                                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
                            >
                                <UserPlus className="h-4 w-4" />
                                Add User
                            </button>
                        </div>
                    </div>

                    {showAddForm && (
                        <form onSubmit={handleAddResident} className="mt-4 rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/30 p-4 space-y-3">
                            {addError && (
                                <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                                    {addError}
                                </div>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Email address *</label>
                                    <input
                                        required
                                        type="email"
                                        placeholder="resident@example.com"
                                        value={addForm.email}
                                        onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                                        maxLength={255}
                                        className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Display name</label>
                                    <input
                                        type="text"
                                        placeholder="Full name (optional)"
                                        value={addForm.name}
                                        onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                                        maxLength={100}
                                        className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => { setShowAddForm(false); setAddError(null); }}
                                    className="rounded-md border border-gray-200 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                                    Cancel
                                </button>
                                <button type="submit" disabled={addLoading}
                                    className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-60">
                                    {addLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                    Add
                                </button>
                            </div>
                        </form>
                    )}
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                            <tr>
                                <th className="px-6 py-3 font-medium">User</th>
                                <th className="px-6 py-3 font-medium">Role</th>
                                <th className="px-6 py-3 font-medium">Units</th>
                                <th className="px-6 py-3 font-medium">Joined</th>
                                <th className="px-6 py-3 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {loading && (
                                <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400 dark:text-gray-500">Loading users...</td></tr>
                            )}
                            {!loading && pageData.length === 0 && (
                                <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400 dark:text-gray-500">No users found.</td></tr>
                            )}
                            {pageData.map(res => {
                                const assigned = residentUnits(res.email);
                                return (
                                    <tr key={res.email} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                        <td className="px-6 py-3">
                                            <div className="flex items-center gap-3">
                                                {res.picture ? (
                                                    <img src={res.picture} alt="" className="h-8 w-8 rounded-full shrink-0 object-cover" referrerPolicy="no-referrer" />
                                                ) : (
                                                    <div className="h-8 w-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                                                        <Users className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                                                    </div>
                                                )}
                                                <div className="min-w-0">
                                                    <div className="font-medium text-gray-900 dark:text-gray-100 truncate">{res.name || '—'}</div>
                                                    <div className="text-xs text-gray-400 dark:text-gray-500 truncate">{res.email}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-3">
                                            <span className={cn(
                                                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
                                                res.role === 'admin'
                                                    ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400"
                                                    : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                                            )}>
                                                {res.role === 'admin' && <Shield className="h-3 w-3" />}
                                                {res.role}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3">
                                            <div className="flex flex-wrap gap-1">
                                                {assigned.length === 0 && <span className="text-xs text-gray-400 dark:text-gray-500">None</span>}
                                                {assigned.map(u => (
                                                    <span key={u.id} className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 px-2 py-0.5 text-xs text-blue-700 dark:text-blue-400">
                                                        {u.unit_no}
                                                        <button onClick={() => setUnassignTarget({ email: res.email, unitId: u.id, unitNo: u.unit_no })} className="text-blue-400 hover:text-red-500 dark:hover:text-red-400">
                                                            <X className="h-3 w-3" />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-6 py-3 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                                            {res.created_at ? new Date(res.created_at).toLocaleDateString('id-ID') : '—'}
                                        </td>
                                        <td className="px-6 py-3 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    onClick={() => { setAssignTarget(res.email); setAssignUnitId(''); setAssignError(null); }}
                                                    className="rounded-md border border-gray-200 dark:border-gray-600 p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                                    title="Assign unit"
                                                >
                                                    <Link className="h-3.5 w-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => setToggleTarget(res)}
                                                    disabled={res.email === adminEmail}
                                                    className="rounded-md border border-gray-200 dark:border-gray-600 p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                    title={res.email === adminEmail ? 'Cannot change own role' : res.role === 'admin' ? 'Revoke admin' : 'Grant admin'}
                                                >
                                                    <Shield className="h-3.5 w-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => setDeleteTarget(res.email)}
                                                    className="rounded-md border border-gray-200 dark:border-gray-600 p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                                    title="Delete user"
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

                <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 px-6 py-3">
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                        {filtered.length === 0 ? 'No results' : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length}`}
                    </span>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                            className="flex items-center rounded-md border border-gray-200 dark:border-gray-600 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed">
                            <ChevronLeft className="h-3.5 w-3.5 mr-0.5" /> Prev
                        </button>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{page} / {totalPages}</span>
                        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                            className="flex items-center rounded-md border border-gray-200 dark:border-gray-600 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed">
                            Next <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Assign Unit Modal */}
            {assignTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="w-full max-w-sm rounded-lg bg-white dark:bg-gray-800 shadow-xl ring-1 ring-gray-900/5 dark:ring-gray-700 p-6">
                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Assign Unit</h3>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Assign a unit to <strong className="text-gray-700 dark:text-gray-300">{assignTarget}</strong></p>
                        <form onSubmit={handleAssignUnit} className="mt-4 space-y-3">
                            {assignError && (
                                <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                                    {assignError}
                                </div>
                            )}
                            <select required value={assignUnitId} onChange={e => setAssignUnitId(e.target.value)}
                                className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
                                <option value="">Select unit...</option>
                                {unassignedUnits.map(u => <option key={u.id} value={u.id}>{u.unit_no}</option>)}
                            </select>
                            {unassignedUnits.length === 0 && (
                                <p className="text-xs text-gray-400 dark:text-gray-500">All units are already assigned.</p>
                            )}
                            <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => setAssignTarget(null)}
                                    className="rounded-md border border-gray-200 dark:border-gray-600 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                                    Cancel
                                </button>
                                <button type="submit" disabled={assignLoading || unassignedUnits.length === 0}
                                    className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60">
                                    {assignLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                                    Assign
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Unassign Unit Confirm */}
            {unassignTarget && (
                <ConfirmModal
                    title="Unassign Unit"
                    message={<>Remove unit <strong>{unassignTarget.unitNo}</strong> from <strong>{unassignTarget.email}</strong>?</>}
                    confirmLabel="Unassign"
                    danger={true}
                    onConfirm={handleUnassignConfirm}
                    onCancel={() => setUnassignTarget(null)}
                    loading={unassignLoading}
                />
            )}

            {/* Toggle Role Confirm */}
            {toggleTarget && (
                <ConfirmModal
                    title={toggleTarget.role === 'admin' ? 'Revoke admin access' : 'Grant admin access'}
                    message={
                        toggleTarget.role === 'admin'
                            ? <>Remove admin access from <strong>{toggleTarget.email}</strong>? They will no longer be able to access this dashboard.</>
                            : <>Grant admin access to <strong>{toggleTarget.email}</strong>? They will be able to sign in to this dashboard.</>
                    }
                    confirmLabel={toggleTarget.role === 'admin' ? 'Revoke' : 'Grant'}
                    danger={toggleTarget.role === 'admin'}
                    onConfirm={handleToggleRole}
                    onCancel={() => setToggleTarget(null)}
                    loading={toggleLoading}
                />
            )}

            {/* Delete Confirm */}
            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="w-full max-w-sm rounded-lg bg-white dark:bg-gray-800 shadow-xl ring-1 ring-gray-900/5 dark:ring-gray-700 p-6">
                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Delete User</h3>
                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                            Remove <strong className="text-gray-700 dark:text-gray-300">{deleteTarget}</strong> from the system? Their unit assignments will also be cleared.
                        </p>
                        {deleteError && (
                            <div className="mt-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                                {deleteError}
                            </div>
                        )}
                        <div className="mt-5 flex justify-end gap-3">
                            <button onClick={() => { setDeleteTarget(null); setDeleteError(null); }} disabled={deleteLoading}
                                className="rounded-md border border-gray-200 dark:border-gray-600 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
                                Cancel
                            </button>
                            <button onClick={handleDeleteConfirm} disabled={deleteLoading}
                                className="flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">
                                {deleteLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
