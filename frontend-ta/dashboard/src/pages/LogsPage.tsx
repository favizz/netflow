import { useState, useEffect, useMemo } from "react";
import { Search, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { fetchApi } from "@/lib/api";

interface LogEntry {
    id: string;
    adminEmail: string;
    action: string;
    targetUnit?: string;
    details?: string;
    createdAt: string;
    ip?: string;
}

const PAGE_SIZE = 10;

export default function LogsPage() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchUnit, setSearchUnit] = useState("");
    const [searchAdmin, setSearchAdmin] = useState("");
    const [page, setPage] = useState(1);

    const load = () => {
        setLoading(true);
        fetchApi('/admin/logs')
            .then((data: any[]) => {
                setLogs(data.map((l: any) => ({
                    id: l.id ?? String(Math.random()),
                    adminEmail: l.adminEmail ?? l.admin_email ?? l.user ?? '—',
                    action: l.action ?? l.event ?? '—',
                    targetUnit: l.targetUnit ?? l.target_unit ?? l.unit_no ?? undefined,
                    details: l.details ?? l.description ?? undefined,
                    createdAt: l.createdAt ?? l.created_at ?? l.timestamp ?? null,
                    ip: l.ip ?? undefined,
                })));
            })
            .catch(() => setLogs([]))
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, []);

    const filtered = useMemo(() => {
        setPage(1);
        return logs.filter(l => {
            const matchUnit = !searchUnit || (l.targetUnit ?? '').toLowerCase().includes(searchUnit.toLowerCase());
            const matchAdmin = !searchAdmin || l.adminEmail.toLowerCase().includes(searchAdmin.toLowerCase());
            return matchUnit && matchAdmin;
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [logs, searchUnit, searchAdmin]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const start = filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
    const end = Math.min(page * PAGE_SIZE, filtered.length);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Activity Logs</h1>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Audit trail for all admin actions.</p>
                </div>
                <button
                    onClick={load}
                    className="flex items-center gap-2 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3">
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400 dark:text-gray-500" />
                    <input
                        type="text"
                        value={searchAdmin}
                        onChange={e => setSearchAdmin(e.target.value)}
                        placeholder="Filter by admin..."
                        className="h-9 w-52 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 pl-9 pr-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-gray-400 dark:placeholder:text-gray-500"
                    />
                </div>
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400 dark:text-gray-500" />
                    <input
                        type="text"
                        value={searchUnit}
                        onChange={e => setSearchUnit(e.target.value)}
                        placeholder="Filter by unit..."
                        className="h-9 w-52 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 pl-9 pr-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-gray-400 dark:placeholder:text-gray-500"
                    />
                </div>
            </div>

            <div className="rounded-lg bg-white dark:bg-gray-800 shadow-sm ring-1 ring-gray-900/5 dark:ring-gray-700 overflow-hidden">
                <table className="w-full text-left text-sm text-gray-500 dark:text-gray-400">
                    <thead className="bg-gray-50 dark:bg-gray-800/60 text-xs uppercase text-gray-700 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                        <tr>
                            <th className="px-6 py-3 font-medium">Timestamp</th>
                            <th className="px-6 py-3 font-medium">Admin</th>
                            <th className="px-6 py-3 font-medium">Action</th>
                            <th className="px-6 py-3 font-medium">Unit</th>
                            <th className="px-6 py-3 font-medium">Details</th>
                            <th className="px-6 py-3 font-medium">IP</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {loading && (
                            <tr>
                                <td colSpan={6} className="px-6 py-8 text-center text-gray-400 dark:text-gray-500">
                                    Loading logs...
                                </td>
                            </tr>
                        )}
                        {!loading && pageData.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-6 py-8 text-center text-gray-400 dark:text-gray-500">
                                    {logs.length === 0
                                        ? "No activity logs found. Ensure the /admin/logs endpoint is implemented."
                                        : "No logs match the current filter."}
                                </td>
                            </tr>
                        )}
                        {pageData.map((log) => (
                            <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                                <td className="px-6 py-3 font-mono text-xs whitespace-nowrap">
                                    {log.createdAt ? new Date(log.createdAt).toLocaleString('id-ID') : '—'}
                                </td>
                                <td className="px-6 py-3 text-gray-900 dark:text-gray-100 text-xs">{log.adminEmail}</td>
                                <td className="px-6 py-3">
                                    <span className="inline-flex rounded-full bg-primary/10 dark:bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
                                        {log.action}
                                    </span>
                                </td>
                                <td className="px-6 py-3 font-medium text-gray-900 dark:text-gray-100 text-xs">
                                    {log.targetUnit ?? '—'}
                                </td>
                                <td className="px-6 py-3 text-xs text-gray-500 dark:text-gray-400 max-w-xs truncate" title={log.details}>
                                    {log.details ?? '—'}
                                </td>
                                <td className="px-6 py-3 font-mono text-xs text-gray-400 dark:text-gray-500">
                                    {log.ip ?? '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Pagination */}
                <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 px-6 py-4">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                        {filtered.length === 0 ? "No results" : `Showing ${start}–${end} of ${filtered.length}`}
                    </div>
                    <div className="flex items-center space-x-2">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="flex items-center rounded-md border border-gray-200 dark:border-gray-600 px-3 py-1 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft className="h-4 w-4 mr-1" /> Prev
                        </button>
                        <span className="text-sm text-gray-500 dark:text-gray-400">{page} / {totalPages}</span>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="flex items-center rounded-md border border-gray-200 dark:border-gray-600 px-3 py-1 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Next <ChevronRight className="h-4 w-4 ml-1" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
