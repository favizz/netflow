import { useState, useEffect } from "react";
import { Outlet, Link } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { Menu, Sun, Moon, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAdminName } from "@/lib/auth";

export function DashboardLayout() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        return (localStorage.getItem('dashboard-theme') as 'light' | 'dark') ?? 'light';
    });

    useEffect(() => {
        const root = document.documentElement;
        if (theme === 'dark') {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
        localStorage.setItem('dashboard-theme', theme);
    }, [theme]);

    const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

    return (
        <div className={cn("flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900")}>
            {/* Mobile sidebar overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-gray-900/50 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <div className={cn(
                "fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 ease-in-out lg:static lg:translate-x-0",
                sidebarOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                <Sidebar onClose={() => setSidebarOpen(false)} />
            </div>

            {/* Main Content */}
            <div className="flex flex-1 flex-col overflow-hidden min-w-0">
                {/* Mobile Header */}
                <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 h-14 lg:hidden">
                    <div className="flex items-center gap-2 min-w-0">
                        <img
                            src={`${import.meta.env.BASE_URL}${theme === 'dark' ? 'netflow-logo-white.png' : 'netflow-logo-black.png'}`}
                            alt="NETFLOW"
                            className="h-6 object-contain shrink-0"
                        />
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                            {getAdminName() || 'Admin'}
                        </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <button
                            onClick={toggleTheme}
                            className="rounded-full p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                        </button>
                        <Link
                            to="/logs"
                            className="rounded-full p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            title="View logs"
                        >
                            <Bell className="h-5 w-5" />
                        </Link>
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="rounded-full p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                            <Menu className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                <div className="hidden lg:block">
                    <Header theme={theme} toggleTheme={toggleTheme} />
                </div>

                <main className="flex-1 overflow-y-auto p-4 lg:p-8">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
