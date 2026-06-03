import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Search, ChevronDown } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { cn } from "@/lib/utils";

type Tx = {
    id: string;
    createdAt: string;
    unitNo: string;
    method: string;
    amount: number;
    status: string;
};

const METHOD_LABEL: Record<string, string> = {
    qris: "QRIS",
    transfer: "Bank Transfer",
    ewallet: "E-Wallet",
};

const STATUS_STYLE: Record<string, string> = {
    success: "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 ring-green-600/20",
    pending: "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 ring-yellow-600/20",
    failed:  "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 ring-red-600/20",
};

const STATUS_OPTIONS = ["All", "success", "pending", "failed"] as const;
const METHOD_OPTIONS = ["All", "qris", "transfer", "ewallet"] as const;

const PAGE_SIZE = 10;

function FilterDropdown<T extends string>({ label, options, value, onChange, displayMap }: {
    label: string;
    options: readonly T[];
    value: T;
    onChange: (v: T) => void;
    displayMap?: Record<string, string>;
}) {
    const [open, setOpen] = useState(false);
    const [dropPos, setDropPos] = useState({ top: 0, right: 0 });
    const btnRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const display = value === "All" ? "All" : (displayMap?.[value] ?? value);

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => {
            if (!btnRef.current?.contains(e.target as Node) && !panelRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);

    const handleToggle = () => {
        if (!open && btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect();
            setDropPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
        }
        setOpen(o => !o);
    };

    return (
        <div className="relative">
            <button
                ref={btnRef}
                onClick={handleToggle}
                className="flex items-center gap-2 h-9 rounded-md border border-gray-200 dark:border-gray-600 px-3 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 bg-white dark:bg-gray-800"
            >
                {label}: <span className="text-gray-900 dark:text-gray-200 capitalize">{display}</span>
                <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {open && createPortal(
                <div
                    ref={panelRef}
                    style={{ position: 'fixed', top: dropPos.top, right: dropPos.right, zIndex: 9999 }}
                    className="min-w-[160px] rounded-md bg-white dark:bg-gray-800 py-1 shadow-lg ring-1 ring-black/5 dark:ring-gray-700"
                >
                    {options.map(o => (
                        <button
                            key={o}
                            onClick={() => { onChange(o); setOpen(false); }}
                            className={cn(
                                "block w-full px-4 py-2 text-left text-sm capitalize hover:bg-gray-50 dark:hover:bg-gray-700",
                                value === o ? "text-primary font-medium" : "text-gray-700 dark:text-gray-300"
                            )}
                        >
                            {o === "All" ? "All" : (displayMap?.[o] ?? o)}
                        </button>
                    ))}
                </div>,
                document.body
            )}
        </div>
    );
}

export default function TransactionsPage() {
    const [transactions, setTransactions] = useState<Tx[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<typeof STATUS_OPTIONS[number]>("All");
    const [methodFilter, setMethodFilter] = useState<typeof METHOD_OPTIONS[number]>("All");

    useEffect(() => {
        fetchApi('/admin/transactions')
            .then((data: { id: string; date?: string; createdAt?: string; unitNo?: string; method?: string; amount?: number; status: string; }[]) => {
                setTransactions(data.map((tx) => ({
                    id: tx.id,
                    createdAt: tx.date ?? tx.createdAt ?? '',
                    unitNo: tx.unitNo ?? '',
                    method: tx.method ?? '',
                    amount: Number(tx.amount ?? 0),
                    status: tx.status,
                })));
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return transactions.filter(tx => {
            const matchSearch = !q || tx.id.toLowerCase().includes(q) || (tx.unitNo ?? '').toLowerCase().includes(q);
            const matchStatus = statusFilter === "All" || tx.status.toLowerCase() === statusFilter.toLowerCase();
            const matchMethod = methodFilter === "All" || tx.method.toLowerCase() === methodFilter.toLowerCase();
            return matchSearch && matchStatus && matchMethod;
        });
    }, [transactions, search, statusFilter, methodFilter]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const start = filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
    const end = Math.min(page * PAGE_SIZE, filtered.length);

    const resetPage = () => setPage(1);

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Transaction Logs</h1>

            <div className="rounded-lg bg-white dark:bg-gray-900 shadow-sm ring-1 ring-gray-900/5 dark:ring-gray-700 overflow-hidden">
                {/* Filter header - same pattern as InventoryTable */}
                <div className="border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Payment History</h2>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
                            <div className="relative w-full sm:w-56">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400 dark:text-gray-500" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={e => { setSearch(e.target.value); resetPage(); }}
                                    placeholder="Search ID or unit..."
                                    className="h-9 w-full rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 pl-9 pr-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-gray-400 dark:placeholder:text-gray-500"
                                />
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <FilterDropdown label="Status" options={STATUS_OPTIONS} value={statusFilter} onChange={v => { setStatusFilter(v); resetPage(); }} />
                                <FilterDropdown label="Method" options={METHOD_OPTIONS} value={methodFilter} onChange={v => { setMethodFilter(v); resetPage(); }} displayMap={METHOD_LABEL} />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-500 dark:text-gray-400 min-w-[640px]">
                    <thead className="bg-gray-50 dark:bg-gray-800 text-xs uppercase text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                        <tr>
                            <th className="px-6 py-3 font-medium">Transaction ID</th>
                            <th className="px-6 py-3 font-medium">Date &amp; Time</th>
                            <th className="px-6 py-3 font-medium">Unit</th>
                            <th className="px-6 py-3 font-medium">Method</th>
                            <th className="px-6 py-3 font-medium">Amount</th>
                            <th className="px-6 py-3 font-medium">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {loading && (
                            <tr>
                                <td colSpan={6} className="px-6 py-8 text-center text-gray-400 dark:text-gray-500">
                                    Loading transactions...
                                </td>
                            </tr>
                        )}
                        {!loading && filtered.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-6 py-8 text-center text-gray-400 dark:text-gray-500">
                                    No transactions found.
                                </td>
                            </tr>
                        )}
                        {pageData.map((tx) => (
                            <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                <td className="px-6 py-4 font-mono text-xs text-gray-900 dark:text-gray-100">{tx.id}</td>
                                <td className="px-6 py-4 text-xs">
                                    {tx.createdAt ? new Date(tx.createdAt).toLocaleString('id-ID') : '-'}
                                </td>
                                <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">{tx.unitNo ?? '-'}</td>
                                <td className="px-6 py-4">{METHOD_LABEL[tx.method] ?? tx.method ?? '-'}</td>
                                <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">
                                    Rp {tx.amount.toLocaleString('id-ID')}
                                </td>
                                <td className="px-6 py-4">
                                    <span className={cn(
                                        "inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset",
                                        STATUS_STYLE[tx.status] ?? STATUS_STYLE.pending
                                    )}>
                                        {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                </div>

                {/* Pagination */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-3">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                        {filtered.length === 0 ? "No results" : `${start}–${end} of ${filtered.length}`}
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="flex items-center rounded-md border border-gray-200 dark:border-gray-600 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft className="h-3.5 w-3.5 mr-0.5" /> Prev
                        </button>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{page} / {totalPages}</span>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="flex items-center rounded-md border border-gray-200 dark:border-gray-600 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Next <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
