import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastType = 'success' | 'error';

export interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    success: (message: string) => void;
    error: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback((message: string, type: ToastType) => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 3000);
    }, []);

    const success = useCallback((message: string) => addToast(message, 'success'), [addToast]);
    const error = useCallback((message: string) => addToast(message, 'error'), [addToast]);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const value = useMemo(() => ({ success, error }), [success, error]);

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-50 flex flex-col gap-2 sm:max-w-sm">
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        className={cn(
                            "relative flex items-start gap-3 w-full rounded-xl p-4 pr-8 shadow-lg border animate-in slide-in-from-bottom-4 fade-in duration-300",
                            toast.type === 'success'
                                ? "bg-white dark:bg-gray-800 border-green-200 dark:border-green-900/50"
                                : "bg-white dark:bg-gray-800 border-red-200 dark:border-red-900/50"
                        )}
                    >
                        {toast.type === 'success' ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-500 shrink-0 mt-0.5" />
                        ) : (
                            <XCircle className="h-4 w-4 text-red-600 dark:text-red-500 shrink-0 mt-0.5" />
                        )}
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 flex-1 leading-snug">{toast.message}</p>
                        <button
                            onClick={() => removeToast(toast.id)}
                            className="absolute top-2 right-2 p-0 bg-transparent border-0 outline-none text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors leading-none"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}
