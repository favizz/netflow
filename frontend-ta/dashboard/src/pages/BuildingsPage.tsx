import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Building2, X, Check, Loader2 } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { useToast } from "@/components/layout/ToastProvider";

type Building = {
    id: number;
    code: string;
    name: string;
    address: string | null;
    floors: number;
    created_at: string;
};

type BuildingForm = {
    code: string;
    name: string;
    address: string;
    floors: number;
};

const EMPTY_FORM: BuildingForm = { code: '', name: '', address: '', floors: 1 };

function friendlyError(err: unknown, fallback: string): string {
    const raw = err instanceof Error ? err.message : fallback;
    const body = raw.replace(/^API error \(\d+\): /, '');
    try {
        const parsed = JSON.parse(body) as { message?: string };
        if (parsed.message && parsed.message.length < 80) return parsed.message;
    } catch { /* not JSON */ }
    return fallback;
}

function BuildingModal({
    initial,
    onSave,
    onClose,
}: {
    initial?: Building;
    onSave: (data: BuildingForm) => Promise<void>;
    onClose: () => void;
}) {
    const [form, setForm] = useState<BuildingForm>(
        initial
            ? { code: initial.code, name: initial.name, address: initial.address ?? '', floors: initial.floors }
            : EMPTY_FORM
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.code.trim() || !form.name.trim()) { setError('Code and name are required.'); return; }
        setSaving(true);
        setError(null);
        try {
            await onSave(form);
            onClose();
        } catch (err: unknown) {
            setError(friendlyError(err, 'Failed to save.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-lg bg-white dark:bg-gray-800 shadow-xl ring-1 ring-gray-900/5 dark:ring-gray-700">
                <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                        {initial ? 'Edit Building' : 'Add Building'}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Code</label>
                        <input
                            type="text"
                            value={form.code}
                            onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                            placeholder="e.g. TWR-A"
                            className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                        <input
                            type="text"
                            value={form.name}
                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                            placeholder="e.g. Tower A"
                            className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
                        <input
                            type="text"
                            value={form.address}
                            onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                            placeholder="Optional"
                            className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Floors</label>
                        <input
                            type="number"
                            min={1}
                            max={200}
                            value={form.floors}
                            onChange={e => setForm(f => ({ ...f, floors: Math.max(1, parseInt(e.target.value) || 1) }))}
                            className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose}
                            className="rounded-md border border-gray-200 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                            Cancel
                        </button>
                        <button type="submit" disabled={saving}
                            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            {initial ? 'Save Changes' : 'Add Building'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default function BuildingsPage() {
    const [buildings, setBuildings] = useState<Building[]>([]);
    const [loading, setLoading] = useState(true);
    const [addOpen, setAddOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<Building | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Building | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    const toast = useToast();

    const load = () => {
        setLoading(true);
        fetchApi('/admin/buildings')
            .then((data: Building[]) => setBuildings(Array.isArray(data) ? data : []))
            .catch(() => setBuildings([]))
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, []);

    const handleAdd = async (form: BuildingForm) => {
        await fetchApi('/admin/buildings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form),
        });
        load();
    };

    const handleEdit = async (form: BuildingForm) => {
        if (!editTarget) return;
        await fetchApi(`/admin/buildings/${editTarget.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form),
        });
        load();
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        setDeleteError(null);
        try {
            await fetchApi(`/admin/buildings/${deleteTarget.id}`, { method: 'DELETE' });
            setDeleteTarget(null);
            load();
        } catch (err: unknown) {
            const msg = friendlyError(err, 'Cannot delete — building still has units assigned to it.');
            setDeleteError(msg);
            toast.error(msg);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Buildings</h1>

            <div className="rounded-lg bg-white dark:bg-gray-900 shadow-sm ring-1 ring-gray-900/5 dark:ring-gray-700 overflow-hidden">
                <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{buildings.length} building{buildings.length !== 1 ? 's' : ''}</span>
                    </div>
                    <button
                        onClick={() => setAddOpen(true)}
                        className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
                    >
                        <Plus className="h-4 w-4" /> Add Building
                    </button>
                </div>

                {loading ? (
                    <div className="px-6 py-12 text-center text-sm text-gray-400 dark:text-gray-500">Loading buildings...</div>
                ) : buildings.length === 0 ? (
                    <div className="flex flex-col items-center justify-center px-6 py-16 text-gray-400 dark:text-gray-500 gap-3">
                        <Building2 className="h-10 w-10 opacity-30" />
                        <p className="text-sm">No buildings yet. Add one to get started.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto"><table className="w-full text-left text-sm text-gray-500 dark:text-gray-400 min-w-[560px]">
                        <thead className="bg-gray-50 dark:bg-gray-800 text-xs uppercase text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                            <tr>
                                <th className="px-6 py-3 font-medium">Code</th>
                                <th className="px-6 py-3 font-medium">Name</th>
                                <th className="px-6 py-3 font-medium">Address</th>
                                <th className="px-6 py-3 font-medium">Floors</th>
                                <th className="px-6 py-3 font-medium">Created</th>
                                <th className="px-6 py-3 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {buildings.map(b => (
                                <tr key={b.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                    <td className="px-6 py-4 font-mono text-xs font-semibold text-gray-900 dark:text-gray-100">{b.code}</td>
                                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">{b.name}</td>
                                    <td className="px-6 py-4 text-gray-500 dark:text-gray-400">{b.address || '—'}</td>
                                    <td className="px-6 py-4">{b.floors}</td>
                                    <td className="px-6 py-4 text-xs">{new Date(b.created_at).toLocaleDateString('en-US')}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                onClick={() => setEditTarget(b)}
                                                className="rounded-md border border-gray-200 dark:border-gray-600 p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                                title="Edit building"
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </button>
                                            <button
                                                onClick={() => { setDeleteTarget(b); setDeleteError(null); }}
                                                className="rounded-md border border-gray-200 dark:border-gray-600 p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                                title="Delete building"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table></div>
                )}
            </div>

            {addOpen && (
                <BuildingModal onSave={handleAdd} onClose={() => setAddOpen(false)} />
            )}

            {editTarget && (
                <BuildingModal initial={editTarget} onSave={handleEdit} onClose={() => setEditTarget(null)} />
            )}

            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="w-full max-w-sm rounded-lg bg-white dark:bg-gray-800 shadow-xl ring-1 ring-gray-900/5 dark:ring-gray-700 p-6">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Delete Building</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                            Delete <span className="font-medium">{deleteTarget.name}</span> ({deleteTarget.code})?
                            This will fail if any units are assigned to it.
                        </p>
                        {deleteError && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{deleteError}</p>}
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setDeleteTarget(null)}
                                className="rounded-md border border-gray-200 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={deleting}
                                className="flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                            >
                                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
