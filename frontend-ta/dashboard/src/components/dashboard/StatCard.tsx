import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
    title: string;
    value: string;
    icon: LucideIcon;
    trend?: string;
    trendLabel?: string;
    trendDirection?: "up" | "down" | "neutral";
    iconColorClass?: string;
    iconBgClass?: string;
    valueColorClass?: string;
}

export function StatCard({
    title,
    value,
    icon: Icon,
    trend,
    trendLabel,
    trendDirection = "neutral",
    iconColorClass = "text-primary",
    iconBgClass = "bg-primary/10",
    valueColorClass = "text-gray-900",
}: StatCardProps) {
    return (
        <div className="rounded-lg bg-white dark:bg-gray-800 p-6 shadow-sm ring-1 ring-gray-900/5 dark:ring-gray-700">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
                    <p className={cn("text-2xl font-bold dark:text-gray-100", valueColorClass)}>{value}</p>
                </div>
                <div className={cn("flex h-12 w-12 items-center justify-center rounded-full", iconBgClass)}>
                    <Icon className={cn("h-6 w-6", iconColorClass)} />
                </div>
            </div>
            {(trend || trendLabel) && (
                <div className="mt-4 flex items-center text-sm">
                    {trend && (
                        <span
                            className={cn("font-medium", {
                                "text-green-600 dark:text-green-400": trendDirection === "up",
                                "text-red-600 dark:text-red-400": trendDirection === "down",
                                "text-gray-600 dark:text-gray-400": trendDirection === "neutral",
                            })}
                        >
                            {trend}
                        </span>
                    )}
                    {trendLabel && <span className="ml-2 text-gray-500 dark:text-gray-400">{trendLabel}</span>}
                </div>
            )}
        </div>
    );
}
