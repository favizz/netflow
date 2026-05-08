import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

const BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

function sendClientError(message: string, stack?: string) {
    const token = localStorage.getItem('admin-token');
    if (!token) return;
    fetch(`${BASE_URL}/admin/client-error`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ message, stack, url: window.location.href }),
    }).catch(() => {});
}

window.addEventListener('error', (e) => {
    sendClientError(e.message, e.error?.stack);
});

window.addEventListener('unhandledrejection', (e) => {
    const msg = e.reason?.message ?? String(e.reason);
    sendClientError(msg, e.reason?.stack);
});

import { ToastProvider } from '@/components/layout/ToastProvider';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
