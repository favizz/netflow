import { Bell, Search, User } from "lucide-react";

export function Header() {
    return (
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
            <div className="flex items-center">
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search units, meters..."
                        className="h-9 w-64 rounded-md border border-gray-200 pl-9 pr-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                </div>
            </div>
            <div className="flex items-center space-x-4">
                <button className="relative rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500">
                    <span className="sr-only">View notifications</span>
                    <Bell className="h-6 w-6" />
                    <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
                </button>
                <div className="h-6 w-px bg-gray-200" />
                <div className="flex items-center space-x-3">
                    <div className="flex flex-col items-end">
                        <span className="text-sm font-medium text-gray-900">Admin User</span>
                        <span className="text-xs text-gray-500">Property Manager</span>
                    </div>
                    <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">
                        <User className="h-5 w-5 text-gray-500" />
                    </div>
                </div>
            </div>
        </header>
    );
}
