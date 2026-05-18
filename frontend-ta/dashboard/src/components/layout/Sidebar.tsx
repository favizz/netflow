import { useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
    LayoutDashboard,
    Monitor,
    CreditCard,
    Users,
    ScrollText,
    SlidersHorizontal,
    HelpCircle,
    LogOut,
    Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getAdminName } from "@/lib/auth";

const navigation = [
    { name: "Overview", href: "/", icon: LayoutDashboard },
    { name: "Devices", href: "/devices", icon: Monitor },
    { name: "Buildings", href: "/buildings", icon: Building2 },
    { name: "Transactions", href: "/transactions", icon: CreditCard },
    { name: "Users", href: "/users", icon: Users },
    { name: "Logs", href: "/logs", icon: ScrollText },
    { name: "Control Center", href: "/control-center", icon: SlidersHorizontal },
    { name: "FAQ", href: "/faq", icon: HelpCircle },
];

interface SidebarProps {
    onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const [showLogoutModal, setShowLogoutModal] = useState(false);
    const adminName = getAdminName();

    const confirmLogout = () => {
        localStorage.removeItem('admin-token');
        navigate('/');
    };

    return (
        <>
            <div className="flex h-full w-64 flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
                <div className="flex h-16 items-center gap-2.5 border-b border-gray-200 dark:border-gray-700 px-5">
                    <img
                        src={`${import.meta.env.BASE_URL}netflow-logo-black.png`}
                        alt="NETFLOW"
                        className="h-7 object-contain dark:hidden"
                    />
                    <img
                        src={`${import.meta.env.BASE_URL}netflow-logo-white.png`}
                        alt="NETFLOW"
                        className="h-7 object-contain hidden dark:block"
                    />
                    <span className="text-base font-bold tracking-tight text-gray-900 dark:text-gray-100">
                        NET<span className="text-primary">FLOW</span>
                    </span>
                </div>
                <div className="flex-1 overflow-y-auto py-4">
                    <nav className="space-y-1 px-2">
                        {navigation.map((item) => {
                            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                            return (
                                <Link
                                    key={item.name}
                                    to={item.href}
                                    onClick={onClose}
                                    className={cn(
                                        "group flex items-center rounded-md px-2 py-2 text-sm font-medium transition-colors",
                                        isActive
                                            ? "bg-primary/10 dark:bg-primary/20 text-primary"
                                            : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100"
                                    )}
                                >
                                    <item.icon
                                        className={cn(
                                            "mr-3 h-5 w-5 flex-shrink-0",
                                            isActive ? "text-primary" : "text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-300"
                                        )}
                                    />
                                    {item.name}
                                </Link>
                            );
                        })}
                    </nav>
                </div>
                <div className="border-t border-gray-200 dark:border-gray-700 p-4">
                    <button
                        onClick={() => setShowLogoutModal(true)}
                        className="group flex w-full items-center rounded-md px-2 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                    >
                        <LogOut className="mr-3 h-5 w-5 text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-300" />
                        Logout
                    </button>
                </div>
            </div>

            {showLogoutModal && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="w-full max-w-sm rounded-lg bg-white dark:bg-gray-800 shadow-xl ring-1 ring-gray-900/5 dark:ring-gray-700 p-6">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            Sign out as <span className="font-normal text-gray-600 dark:text-gray-400">{adminName || 'Admin'}</span>?
                        </p>
                        <div className="mt-5 flex justify-end gap-3">
                            <button
                                onClick={() => setShowLogoutModal(false)}
                                className="rounded-md border border-gray-200 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmLogout}
                                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
                            >
                                Sign out
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
