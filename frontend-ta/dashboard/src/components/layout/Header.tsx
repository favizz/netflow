import { useState, useEffect, useRef } from "react";
import { Bell, Sun, Moon, User, X } from "lucide-react";
import { getAdminEmail } from "@/lib/auth";
import { fetchApi } from "@/lib/api";

interface HeaderProps {
    theme: 'light' | 'dark';
    toggleTheme: () => void;
}

export function Header({ theme, toggleTheme }: HeaderProps) {
    const [notifOpen, setNotifOpen] = useState(false);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [readIds, setReadIds] = useState<Set<string>>(new Set());
    const readIdsRef = useRef<Set<string>>(readIds);
    const adminEmail = getAdminEmail();

    useEffect(() => {
        readIdsRef.current = readIds;
    }, [readIds]);

    useEffect(() => {
        const loadNotifications = () => {
            fetchApi('/admin/anomalies')
                .then(data => {
                    const mapped = (data || []).map((a: any) => {
                        const uniqueId = `${a.anomalyType}-${(a.message || '').slice(0, 50)}`;
                        return {
                            id: uniqueId,
                            title: `${(a.anomalyType || 'ANOMALY').replace('_', ' ').toUpperCase()}`,
                            desc: a.message,
                            time: new Date(a.detectedAt).toLocaleTimeString('id-ID'),
                            unread: !readIdsRef.current.has(uniqueId)
                        };
                    });
                    setNotifications(mapped);
                })
                .catch(() => {});
        };

        loadNotifications();
        const interval = setInterval(loadNotifications, 15000);
        return () => clearInterval(interval);
    }, []);

    const unreadCount = notifications.filter(n => n.unread).length;

    const markAllRead = () => {
        const newReadIds = new Set(readIds);
        notifications.forEach(n => newReadIds.add(n.id));
        setReadIds(newReadIds);
        setNotifications(prev => prev.map(n => ({ ...n, unread: false })));
    };

    return (
        <header className="flex h-16 items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 relative">
            <div />
            <div className="flex items-center space-x-3">
                <button
                    onClick={toggleTheme}
                    className="rounded-full p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                    {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                </button>

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
                                        <button onClick={markAllRead} className="text-xs text-primary hover:underline">
                                            Mark all read
                                        </button>
                                    )}
                                    <button onClick={() => setNotifOpen(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
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
                                            {n.unread && <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-primary" />}
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
                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[140px]">{adminEmail || 'Property Manager'}</span>
                    </div>
                    <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                        <User className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                    </div>
                </div>
            </div>
        </header>
    );
}
