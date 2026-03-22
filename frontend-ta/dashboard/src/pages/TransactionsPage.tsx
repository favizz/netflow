export default function TransactionsPage() {
    const transactions = [
        { id: "TX-9921", date: "2024-03-10 14:30", user: "Sarah Chen", unit: "A-1204", type: "Token Purchase", amount: "Rp 100.000", status: "Success" },
        { id: "TX-9922", date: "2024-03-10 15:15", user: "Michael Ross", unit: "B-0805", type: "Utility Bill", amount: "Rp 350.000", status: "Pending" },
        { id: "TX-9923", date: "2024-03-10 16:00", user: "James Wilson", unit: "A-0302", type: "Auto-Debit", amount: "Rp 150.000", status: "Success" },
        { id: "TX-9924", date: "2024-03-10 16:45", user: "System", unit: "-", type: "Maintenance Fee", amount: "-", status: "Logged" },
        { id: "TX-9925", date: "2024-03-11 09:00", user: "Emily Davis", unit: "C-1501", type: "Token Purchase", amount: "Rp 50.000", status: "Success" },
    ];

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
