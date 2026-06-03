import { useState, useEffect, useCallback, useRef } from "react";
import { Bell, Sun, Moon, User, X, AlertTriangle, Copy, Check } from "lucide-react";
import { getAdminName, getAdminEmail } from "@/lib/auth";
import { fetchApi } from "@/lib/api";

const NOTIF_LAST_READ_KEY = 'notif_last_read';
const MAX_NOTIFS = 30;

interface AuditEntry {
    id: number;
    created_at: string;
    admin_email: string | null;
    action: string | null;
    entity: string | null;
    entity_id: string | null;
    details: string | null;
    result: 'success' | 'failure' | 'info' | null;
}

interface NotifItem {
    id: number;
    title: string;
    desc: string;
    time: string;
    read: boolean;
}

function relativeTime(iso: string): string {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

function actionTitle(action: string | null, entity: string | null): string {
    if (!action) return 'System event';
    if (action.startsWith('ANOMALY')) return `Anomaly detected${entity ? ` – ${entity}` : ''}`;
    if (action.startsWith('CLIENT_ERROR')) return `Device error${entity ? ` – ${entity}` : ''}`;
    if (action.includes('OTA')) return `Firmware event${entity ? ` – ${entity}` : ''}`;
    return `${action.replace(/_/g, ' ')}${entity ? ` – ${entity}` : ''}`;
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const copy = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 1500);
        }).catch(() => {});
    };
    return (
        <button
            onClick={copy}
            title="Copy message"
            className="shrink-0 rounded p-0.5 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
        >
            {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
        </button>
    );
}

interface HeaderProps {
    theme: 'light' | 'dark';
    toggleTheme: () => void;
}

export function Header({ theme, toggleTheme }: HeaderProps) {
    const [notifOpen, setNotifOpen] = useState(false);
    const [notifications, setNotifications] = useState<NotifItem[]>([]);
    const adminName = getAdminName();

    const loadNotifications = useCallback(async () => {
        try {
            const logs: AuditEntry[] = await fetchApi('/admin/audit-logs');
            const lastRead = localStorage.getItem(NOTIF_LAST_READ_KEY);
            const lastReadDate = lastRead ? new Date(lastRead) : null;
            const windowCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

            const relevant = (logs || [])
                .filter(log => {
                    const action = log.action ?? '';
                    const isAlert =
                        action.startsWith('ANOMALY') ||
                        action.startsWith('CLIENT_ERROR') ||
                        (log.result === 'failure' && ['SEND_COMMAND', 'OTA_PUSH', 'ASSIGN_UNIT'].some(p => action.startsWith(p)));
                    return isAlert && new Date(log.created_at) > windowCutoff;
                })
                .slice(0, MAX_NOTIFS)
                .map(log => ({
                    id: log.id,
                    title: actionTitle(log.action, log.entity),
                    desc: log.details
                        ? (() => { try { return JSON.stringify(JSON.parse(log.details)).slice(0, 80); } catch { return log.details.slice(0, 80); } })()
                        : (log.result === 'failure' ? 'Action failed' : 'See logs for details'),
                    time: relativeTime(log.created_at),
                    read: lastReadDate ? new Date(log.created_at) <= lastReadDate : false,
                }));

            setNotifications(relevant);
        } catch {
            setNotifications([]);
        }
    }, []);

    useEffect(() => {
        void loadNotifications();
    }, [loadNotifications]);

    const handleBellClick = () => {
        if (notifOpen) {
            setNotifOpen(false);
            localStorage.setItem(NOTIF_LAST_READ_KEY, new Date().toISOString());
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        } else {
            setNotifOpen(true);
        }
    };

    const unreadCount = notifications.filter(n => !n.read).length;

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
                        onClick={handleBellClick}
                        className="relative rounded-full p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                        <span className="sr-only">View notifications</span>
                        <Bell className="h-5 w-5" />
                        {unreadCount > 0 && (
                            <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white dark:ring-gray-800">
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </span>
                        )}
                    </button>

                    {notifOpen && (
                        <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-1rem)] rounded-xl bg-white dark:bg-gray-800 shadow-xl ring-1 ring-gray-200 dark:ring-gray-700 z-50">
                            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Notifications</h3>
                                <button onClick={handleBellClick} className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            </div>
                            <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-72 overflow-y-auto">
                                {notifications.length === 0 ? (
                                    <p className="px-4 py-6 text-center text-sm text-gray-400">All caught up</p>
                                ) : (
                                    notifications.map(n => (
                                        <div key={n.id} className={`flex items-start gap-3 px-4 py-3 transition-colors ${n.read ? 'opacity-50' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}>
                                            <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${n.read ? 'text-gray-400' : 'text-amber-500'}`} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{n.title}</p>
                                                <div className="flex items-center gap-1 mt-0.5">
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate flex-1">{n.desc}</p>
                                                    <CopyButton text={`${n.title}\n${n.desc}`} />
                                                </div>
                                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{n.time}</p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                            {unreadCount > 0 && (
                                <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700">
                                    <p className="text-xs text-gray-400 dark:text-gray-500 text-center">Closing marks all as read</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="h-6 w-px bg-gray-200 dark:bg-gray-600" />
                <div className="flex items-center space-x-3">
                    <div className="flex flex-col items-end">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{adminName || 'Admin'}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[140px]">{getAdminEmail() || 'admin'}</span>
                    </div>
                    <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                        <User className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                    </div>
                </div>
            </div>
        </header>
    );
}
