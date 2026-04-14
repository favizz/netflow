import { useState } from "react";
import { Bell, Search, User, Sun, Moon, X } from "lucide-react";

interface HeaderProps {
    theme: 'light' | 'dark';
    toggleTheme: () => void;
}

const MOCK_NOTIFICATIONS = [
    { id: 1, title: "Low balance — Unit A-201", desc: "Balance below Rp 20,000", time: "2m ago", unread: true },
    { id: 2, title: "Device offline — SM-003", desc: "No heartbeat for 10 minutes", time: "15m ago", unread: true },
    { id: 3, title: "Payment received — Unit B-102", desc: "Rp 100,000 via QRIS", time: "1h ago", unread: false },
];

export function Header({ theme, toggleTheme }: HeaderProps) {
    const [notifOpen, setNotifOpen] = useState(false);
    const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);

    const unreadCount = notifications.filter(n => n.unread).length;

    const markAllRead = () => {
        setNotifications(prev => prev.map(n => ({ ...n, unread: false })));
    };

    return (
        <header className="flex h-16 items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 relative">
            <div className="flex items-center">
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400 dark:text-gray-500" />
                    <input
                        type="text"
                        placeholder="Search units, meters..."
                        className="h-9 w-64 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 pl-9 pr-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-gray-400 dark:placeholder:text-gray-500"
                    />
                </div>
            </div>
            <div className="flex items-center space-x-3">
                {/* Theme toggle */}
                <button
                    onClick={toggleTheme}
                    className="rounded-full p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                    {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                </button>

                {/* Notification bell */}
                <div className="relative">
                    <button
                        onClick={() => setNotifOpen(o => !o)}
                        className="relative rounded-full p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                        <span className="sr-only">View notifications</span>
                        <Bell className="h-5 w-5" />
                        {unreadCount > 0 && (
                            <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white dark:ring-gray-800">
                                {unreadCount}
                            </span>
                        )}
                    </button>

                    {notifOpen && (
                        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl bg-white dark:bg-gray-800 shadow-xl ring-1 ring-gray-200 dark:ring-gray-700 z-50">
                            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Notifications</h3>
                                <div className="flex items-center gap-2">
                                    {unreadCount > 0 && (
                                        <button
                                            onClick={markAllRead}
                                            className="text-xs text-primary hover:underline"
                                        >
                                            Mark all read
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setNotifOpen(false)}
                                        className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>
                            <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-72 overflow-y-auto">
                                {notifications.length === 0 ? (
                                    <p className="px-4 py-6 text-center text-sm text-gray-400">No notifications</p>
                                ) : (
                                    notifications.map(n => (
                                        <div key={n.id} className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${n.unread ? 'bg-primary-subtle/30' : ''}`}>
                                            {n.unread && (
                                                <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
                                            )}
                                            {!n.unread && <span className="mt-1.5 h-2 w-2 flex-shrink-0" />}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{n.title}</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">{n.desc}</p>
                                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{n.time}</p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="h-6 w-px bg-gray-200 dark:bg-gray-600" />
                <div className="flex items-center space-x-3">
                    <div className="flex flex-col items-end">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Admin</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">Property Manager</span>
                    </div>
                    <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                        <User className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                    </div>
                </div>
            </div>
        </header>
    );
}
