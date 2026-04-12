import { useState, useEffect } from "react";
import { fetchApi } from "@/lib/api";

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
    success: "bg-green-50 text-green-700 ring-green-600/20",
    pending: "bg-yellow-50 text-yellow-700 ring-yellow-600/20",
    failed:  "bg-red-50 text-red-700 ring-red-600/20",
};

export default function TransactionsPage() {
    const [transactions, setTransactions] = useState<Tx[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchApi('/admin/transactions')
            .then((data: any[]) => {
                setTransactions(data.map((tx: any) => ({
                    id: tx.id,
                    // Admin service maps createdAt onto tx.date; entity map uses tx.created_at
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

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-gray-900">Transaction Logs</h1>

            <div className="rounded-lg bg-white shadow-sm ring-1 ring-gray-900/5 overflow-hidden">
                <table className="w-full text-left text-sm text-gray-500">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-700">
                        <tr>
                            <th className="px-6 py-3 font-medium">Transaction ID</th>
                            <th className="px-6 py-3 font-medium">Date &amp; Time</th>
                            <th className="px-6 py-3 font-medium">Unit</th>
                            <th className="px-6 py-3 font-medium">Method</th>
                            <th className="px-6 py-3 font-medium">Amount</th>
                            <th className="px-6 py-3 font-medium">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {loading && (
                            <tr><td colSpan={6} className="px-6 py-4 text-center">Loading transactions...</td></tr>
                        )}
                        {!loading && transactions.length === 0 && (
                            <tr><td colSpan={6} className="px-6 py-4 text-center">No transactions available.</td></tr>
                        )}
                        {transactions.map((tx) => (
                            <tr key={tx.id}>
                                <td className="px-6 py-4 font-mono text-xs text-gray-900">{tx.id}</td>
                                <td className="px-6 py-4">
                                    {tx.createdAt ? new Date(tx.createdAt).toLocaleString('id-ID') : '—'}
                                </td>
                                <td className="px-6 py-4 font-medium text-gray-900">{tx.unitNo ?? '—'}</td>
                                <td className="px-6 py-4">{METHOD_LABEL[tx.method] ?? tx.method ?? '—'}</td>
                                <td className="px-6 py-4 font-medium text-gray-900">
                                    Rp {tx.amount.toLocaleString('id-ID')}
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${STATUS_STYLE[tx.status] ?? STATUS_STYLE.pending}`}>
                                        {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
