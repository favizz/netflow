import { useState, useEffect, useRef } from "react";
import { ScrollText, Search, ChevronDown, Copy, Check, ExternalLink } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { API_BASE_URL } from "@/lib/constants";

const PAGE_SIZE = 15;

const ACTION_CATEGORY: Record<string, string> = {
    CREATE: 'User Management',
    DELETE: 'User Management',
    UPDATE_ACCESS: 'User Management',
    ASSIGN_UNIT: 'Unit Management',
    UNASSIGN_UNIT: 'Unit Management',
    UPDATE_SETTINGS: 'Calibration',
    'CREATE_TARIFF': 'Tariff',
    'UPDATE_TARIFF': 'Tariff',
    'DELETE_TARIFF': 'Tariff',
    TOKEN_PURCHASE: 'Transactions',
    ANOMALY: 'Anomaly',
    CLIENT_ERROR: 'System Error',
    OTA_PUSH: 'Firmware',
    OTA_ACK: 'Firmware',
};

function deriveCategory(action: string): string {
    for (const [key, cat] of Object.entries(ACTION_CATEGORY)) {
        if (action.startsWith(key)) return cat;
    }
    return 'Other';
}

const CATEGORIES = ['All', 'User Management', 'Unit Management', 'Calibration', 'Tariff', 'Transactions', 'Anomaly', 'Firmware', 'System Error', 'Other'];
const RESULTS = ['All', 'success', 'failure', 'info'];

const RESULT_STYLE: Record<string, string> = {
    success: "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 ring-green-600/20",
    failure: "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 ring-red-600/20",
    info:    "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 ring-blue-600/20",
};

function CopyCell({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleCopy = () => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 2000);
        }).catch(() => {});
    };

    return (
        <button
            onClick={handleCopy}
            title="Click to copy"
            className="group relative flex items-center gap-1.5 max-w-[200px] text-left hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
            <span className="truncate">{text}</span>
            <span className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                {copied
                    ? <Check className="h-3 w-3 text-green-500" />
                    : <Copy className="h-3 w-3 text-gray-400" />
                }
            </span>
            {copied && (
                <span className="absolute -top-6 left-1/2 -translate-x-1/2 rounded bg-gray-900 dark:bg-gray-700 px-2 py-0.5 text-[10px] text-white whitespace-nowrap pointer-events-none">
                    Copied
                </span>
            )}
        </button>
    );
}

type LogEntry = {
    id: string;
    timestamp: string;
    actor: string;
    action: string;
    category: string;
    entity: string;
    entity_id: string | null;
    details: string | null;
    result: 'success' | 'failure' | 'info';
};

function mapAuditLog(entry: any): LogEntry {
    return {
        id: String(entry.id),
        timestamp: entry.created_at,
        actor: entry.admin_email ?? 'system',
        action: entry.action ?? '',
        category: deriveCategory(entry.action ?? ''),
        entity: entry.entity ?? '',
        entity_id: entry.entity_id ?? null,
        details: entry.details,
        result: (entry.result as any) ?? 'success',
    };
}

function FilterDropdown({ label, options, value, onChange }: {
    label: string;
    options: string[];
    value: string;
    onChange: (v: string) => void;
}) {
    const [open, setOpen] = useState(false);
    return (
        <div className="relative">
            <button
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-2 rounded-md border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 bg-white dark:bg-gray-800"
            >
                {label}: <span className="text-gray-900 dark:text-gray-200 capitalize">{value}</span>
                <ChevronDown className="h-4 w-4" />
            </button>
            {open && (
                <div className="absolute left-0 mt-1 min-w-[160px] rounded-md bg-white dark:bg-gray-800 py-1 shadow-lg ring-1 ring-black/5 dark:ring-gray-700 z-10">
                    {options.map(o => (
                        <button key={o} onClick={() => { onChange(o); setOpen(false); }}
                            className="block w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 capitalize">
                            {o}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function LogsPage() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterCategory, setFilterCategory] = useState('All');
    const [filterResult, setFilterResult] = useState('All');
    const [page, setPage] = useState(0);

    useEffect(() => {
        setLoading(true);
        fetchApi('/admin/audit-logs')
            .then((data: any[]) => setLogs(Array.isArray(data) ? data.map(mapAuditLog) : []))
            .catch(() => setLogs([]))
            .finally(() => setLoading(false));
    }, []);

    const filtered = logs.filter(l => {
        const q = search.toLowerCase();
        const matchSearch = !q || l.actor.toLowerCase().includes(q) || l.action.toLowerCase().includes(q) || l.entity.toLowerCase().includes(q) || (l.entity_id ?? '').toLowerCase().includes(q) || (l.details ?? '').toLowerCase().includes(q);
        const matchCat = filterCategory === 'All' || l.category === filterCategory;
        const matchResult = filterResult === 'All' || l.result === filterResult;
        return matchSearch && matchCat && matchResult;
    });

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <ScrollText className="h-6 w-6 text-primary" />
                        System Logs
                    </h1>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Audit trail of admin actions and system events.
                    </p>
                </div>
                <a
                    href={`${API_BASE_URL}/admin/queues`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-md border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors whitespace-nowrap"
                >
                    <ExternalLink className="h-4 w-4" />
                    Queue Monitor
                </a>
            </div>

            <div className="rounded-lg bg-white dark:bg-gray-900 shadow-sm ring-1 ring-gray-900/5 dark:ring-gray-700 overflow-hidden">
                {/* Filter header — same pattern as InventoryTable */}
                <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4">
                    <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
                        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                            Audit Trail <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">{filtered.length} entries</span>
                        </h2>
                        <div className="flex space-x-3">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400 dark:text-gray-500" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={e => { setSearch(e.target.value); setPage(0); }}
                                    placeholder="Search logs..."
                                    className="h-9 w-56 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 pl-9 pr-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-gray-400 dark:placeholder:text-gray-500"
                                />
                            </div>
                            <FilterDropdown label="Category" options={CATEGORIES} value={filterCategory} onChange={v => { setFilterCategory(v); setPage(0); }} />
                            <FilterDropdown label="Result" options={RESULTS} value={filterResult} onChange={v => { setFilterResult(v); setPage(0); }} />
                        </div>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-500 dark:text-gray-400">
                        <thead className="bg-gray-50 dark:bg-gray-800 text-xs uppercase text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                            <tr>
                                <th className="px-4 py-3 font-medium">Timestamp</th>
                                <th className="px-4 py-3 font-medium">Admin</th>
                                <th className="px-4 py-3 font-medium">Action</th>
                                <th className="px-4 py-3 font-medium">Category</th>
                                <th className="px-4 py-3 font-medium">Target</th>
                                <th className="px-4 py-3 font-medium">Details</th>
                                <th className="px-4 py-3 font-medium">Result</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {loading && (
                                <tr><td colSpan={7} className="px-4 py-6 text-center">Loading logs...</td></tr>
                            )}
                            {!loading && pageItems.length === 0 && (
                                <tr><td colSpan={7} className="px-4 py-6 text-center">No log entries found.</td></tr>
                            )}
                            {pageItems.map(log => (
                                <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-gray-900 dark:text-gray-300">
                                        {log.timestamp ? new Date(log.timestamp).toLocaleString('id-ID') : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-primary font-medium whitespace-nowrap">{log.actor}</td>
                                    <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">{log.action}</td>
                                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{log.category}</td>
                                    <td className="px-4 py-3 text-xs text-gray-900 dark:text-gray-300">
                                        {log.entity}{log.entity_id ? ` #${log.entity_id}` : ''}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                                        {log.details ? (
                                            <CopyCell text={(() => { try { return JSON.stringify(JSON.parse(log.details)); } catch { return log.details; } })()} />
                                        ) : '—'}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${RESULT_STYLE[log.result] ?? RESULT_STYLE.info}`}>
                                            {log.result}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 px-4 py-3">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                        {filtered.length === 0 ? 'No entries' : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, filtered.length)} of ${filtered.length}`}
                    </span>
                    <div className="flex gap-2">
                        <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                            className="rounded border border-gray-200 dark:border-gray-600 px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800">
                            Previous
                        </button>
                        <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
                            className="rounded border border-gray-200 dark:border-gray-600 px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800">
                            Next
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
