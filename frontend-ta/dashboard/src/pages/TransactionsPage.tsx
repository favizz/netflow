import { useState, useEffect } from "react";
import { fetchApi } from "@/lib/api";

type Tx = {
    id: string;
    date: string;
    user: string;
    unit: string;
    type: string;
    amount: string;
    status: string;
};

export default function TransactionsPage() {
    const [transactions, setTransactions] = useState<Tx[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchApi('/admin/transactions')
            .then(data => {
                setTransactions(data.map((tx: any) => ({
                    id: tx.id,
                    date: tx.date ? new Date(tx.date).toLocaleString() : 'N/A',
                    user: tx.user,
                    unit: tx.unitNo,
                    type: tx.type,
                    amount: `Rp ${tx.amount.toLocaleString('id-ID')}`,
                    status: tx.status.charAt(0).toUpperCase() + tx.status.slice(1)
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
                            <th className="px-6 py-3 font-medium">Date & Time</th>
                            <th className="px-6 py-3 font-medium">User / Unit</th>
                            <th className="px-6 py-3 font-medium">Type</th>
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
                            <tr key={tx.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 font-mono text-xs text-gray-900">{tx.id}</td>
                                <td className="px-6 py-4">{tx.date}</td>
                                <td className="px-6 py-4">
                                    <div className="font-medium text-gray-900">{tx.user}</div>
                                    <div className="text-xs">{tx.unit}</div>
                                </td>
                                <td className="px-6 py-4">{tx.type}</td>
                                <td className="px-6 py-4 font-medium text-gray-900">{tx.amount}</td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                                        tx.status === 'Success' ? 'bg-green-50 text-green-700 ring-green-600/20' :
                                        tx.status === 'Pending' ? 'bg-yellow-50 text-yellow-700 ring-yellow-600/20' :
                                        'bg-gray-50 text-gray-600 ring-gray-500/10'
                                    }`}>
                                        {tx.status}
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
