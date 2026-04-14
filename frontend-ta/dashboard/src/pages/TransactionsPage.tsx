import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

const PAGE_SIZE = 10;

export default function TransactionsPage() {
    const [transactions, setTransactions] = useState<Tx[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);

    useEffect(() => {
        fetchApi('/admin/transactions')
            .then((data: any[]) => {
                setTransactions(data.map((tx: any) => ({
                    id: tx.id,
                    createdAt: tx.date ?? tx.createdAt ?? tx.created_at ?? null,
                    unitNo: tx.unitNo ?? tx.unit_no,
                    method: tx.type ?? tx.method,
                    amount: Number(tx.amount ?? tx.amount_rp ?? 0),
                    status: tx.status,
                })));
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const totalPages = Math.max(1, Math.ceil(transactions.length / PAGE_SIZE));
    const pageData = transactions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const start = transactions.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
    const end = Math.min(page * PAGE_SIZE, transactions.length);

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Transaction Logs</h1>

            <div className="rounded-lg bg-white dark:bg-gray-800 shadow-sm ring-1 ring-gray-900/5 dark:ring-gray-700 overflow-hidden">
                <table className="w-full text-left text-sm text-gray-500 dark:text-gray-400">
                    <thead className="bg-gray-50 dark:bg-gray-800/60 text-xs uppercase text-gray-700 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
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
                        {!loading && transactions.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-6 py-8 text-center text-gray-400 dark:text-gray-500">
                                    No transactions available.
                                </td>
                            </tr>
                        )}
                        {pageData.map((tx) => (
                            <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                                <td className="px-6 py-4 font-mono text-xs text-gray-900 dark:text-gray-100">{tx.id}</td>
                                <td className="px-6 py-4 text-xs">
                                    {tx.createdAt ? new Date(tx.createdAt).toLocaleString('id-ID') : '—'}
                                </td>
                                <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">{tx.unitNo ?? '—'}</td>
                                <td className="px-6 py-4">{METHOD_LABEL[tx.method] ?? tx.method ?? '—'}</td>
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

                {/* Pagination */}
                <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 px-6 py-4">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                        {transactions.length === 0 ? "No results" : `Showing ${start}–${end} of ${transactions.length}`}
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
