import { useState, useEffect } from "react";
import { ScrollText, Search, Filter, ChevronDown } from "lucide-react";
import { fetchApi } from "@/lib/api";

const PAGE_SIZE = 10;

type LogEntry = {
    id: string;
    timestamp: string;
    actor: string;
    actorRole: 'admin' | 'system' | 'resident';
    action: string;
    target: string;
    details: string;
    result: 'success' | 'failure' | 'info';
};

const RESULT_STYLE: Record<string, string> = {
    success: "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 ring-green-600/20",
    failure: "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 ring-red-600/20",
    info:    "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 ring-blue-600/20",
};

const ACTOR_STYLE: Record<string, string> = {
    admin:    "text-primary font-medium",
    system:   "text-yellow-600 dark:text-yellow-400 font-medium",
    resident: "text-blue-600 dark:text-blue-400 font-medium",
};

// Synthesise log entries from transactions + anomalies as a proxy for audit log
// until a dedicated /admin/logs endpoint is implemented
function synthesiseLogs(transactions: any[], anomalies: any[]): LogEntry[] {
    const logs: LogEntry[] = [];

    transactions.forEach(tx => {
        logs.push({
            id: `tx-${tx.id}`,
            timestamp: tx.date ?? tx.createdAt ?? tx.created_at,
            actor: tx.unitNo ?? tx.unit_no ?? 'Unknown',
            actorRole: 'resident',
            action: 'TOKEN_PURCHASE',
            target: `Unit ${tx.unitNo ?? tx.unit_no}`,
            details: `Rp ${Number(tx.amount ?? tx.amount_rp).toLocaleString('id-ID')} via ${tx.method ?? tx.type} — ${tx.status}`,
            result: tx.status === 'success' ? 'success' : tx.status === 'failed' ? 'failure' : 'info',
        });
    });

    anomalies.forEach((a: any) => {
        logs.push({
            id: `anm-${a.id}`,
            timestamp: a.created_at,
            actor: a.device_id ?? 'system',
            actorRole: 'system',
            action: `ANOMALY_${(a.type ?? '').toUpperCase()}`,
            target: `Device ${a.device_id}`,
            details: a.description,
            result: a.severity === 'critical' ? 'failure' : 'info',
        });
    });

    return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export default function LogsPage() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterRole, setFilterRole] = useState<'All' | 'admin' | 'system' | 'resident'>('All');
    const [filterOpen, setFilterOpen] = useState(false);
    const [page, setPage] = useState(0);

    useEffect(() => {
        setLoading(true);
        Promise.all([
            fetchApi('/admin/transactions').catch(() => []),
            fetchApi('/admin/anomalies').catch(() => []),
        ]).then(([txs, anoms]) => {
            setLogs(synthesiseLogs(txs, anoms));
        }).finally(() => setLoading(false));
    }, []);

    const filtered = logs.filter(l => {
        const matchesSearch =
            l.actor.toLowerCase().includes(search.toLowerCase()) ||
            l.action.toLowerCase().includes(search.toLowerCase()) ||
            l.target.toLowerCase().includes(search.toLowerCase()) ||
            l.details.toLowerCase().includes(search.toLowerCase());
        const matchesRole = filterRole === 'All' || l.actorRole === filterRole;
        return matchesSearch && matchesRole;
    });

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <ScrollText className="h-6 w-6 text-primary" />
                        System Logs
                    </h1>
                    <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                        Audit trail of all user actions, system events, and anomalies. {filtered.length} entries.
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(0); }}
                        placeholder="Search logs..."
                        className="h-9 w-full rounded-md border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 pl-9 pr-4 text-sm text-gray-900 dark:text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                </div>
                <div className="relative">
                    <button
                        onClick={() => setFilterOpen(o => !o)}
                        className="flex items-center gap-2 rounded-md border border-gray-200 dark:border-slate-600 px-3 py-2 text-sm font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800"
                    >
                        <Filter className="h-4 w-4" />
                        {filterRole === 'All' ? 'All Actors' : filterRole}
                        <ChevronDown className="h-4 w-4" />
                    </button>
                    {filterOpen && (
                        <div className="absolute left-0 mt-2 w-40 rounded-md bg-white dark:bg-slate-800 py-1 shadow-lg ring-1 ring-black/5 z-10">
                            {(['All', 'admin', 'system', 'resident'] as const).map(r => (
                                <button key={r} onClick={() => { setFilterRole(r); setFilterOpen(false); setPage(0); }}
                                    className="block w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 capitalize">
                                    {r}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Table */}
            <div className="rounded-lg bg-white dark:bg-slate-900 shadow-sm ring-1 ring-gray-900/5 dark:ring-slate-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-500 dark:text-slate-400">
                        <thead className="bg-gray-50 dark:bg-slate-800 text-xs uppercase text-gray-700 dark:text-slate-300">
                            <tr>
                                <th className="px-4 py-3 font-medium">Timestamp</th>
                                <th className="px-4 py-3 font-medium">Actor</th>
                                <th className="px-4 py-3 font-medium">Action</th>
                                <th className="px-4 py-3 font-medium">Target</th>
                                <th className="px-4 py-3 font-medium">Details</th>
                                <th className="px-4 py-3 font-medium">Result</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                            {loading && (
                                <tr><td colSpan={6} className="px-4 py-6 text-center">Loading logs...</td></tr>
                            )}
                            {!loading && pageItems.length === 0 && (
                                <tr><td colSpan={6} className="px-4 py-6 text-center">No log entries found.</td></tr>
                            )}
                            {pageItems.map(log => (
                                <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-gray-900 dark:text-slate-300">
                                        {log.timestamp ? new Date(log.timestamp).toLocaleString('id-ID') : '—'}
                                    </td>
                                    <td className={`px-4 py-3 whitespace-nowrap text-xs ${ACTOR_STYLE[log.actorRole]}`}>
                                        {log.actor}
                                    </td>
                                    <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-slate-300">{log.action}</td>
                                    <td className="px-4 py-3 text-xs text-gray-900 dark:text-slate-300">{log.target}</td>
                                    <td className="px-4 py-3 text-xs max-w-xs truncate" title={log.details}>{log.details}</td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${RESULT_STYLE[log.result]}`}>
                                            {log.result}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between border-t border-gray-200 dark:border-slate-700 px-4 py-3">
                    <span className="text-xs text-gray-500 dark:text-slate-400">
                        Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                    </span>
                    <div className="flex gap-2">
                        <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                            className="rounded border border-gray-200 dark:border-slate-600 px-3 py-1 text-xs font-medium text-gray-600 dark:text-slate-400 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-slate-800">
                            Previous
                        </button>
                        <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
                            className="rounded border border-gray-200 dark:border-slate-600 px-3 py-1 text-xs font-medium text-gray-600 dark:text-slate-400 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-slate-800">
                            Next
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
