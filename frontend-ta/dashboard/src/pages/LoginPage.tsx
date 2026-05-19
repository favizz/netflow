import { useState, useEffect, useRef, useSyncExternalStore } from 'react';

function useIsDark() {
  return useSyncExternalStore(
    (cb) => { const mq = window.matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener('change', cb); return () => mq.removeEventListener('change', cb); },
    () => document.documentElement.classList.contains('dark') || window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
}
import { useNavigate } from 'react-router-dom';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: object) => void;
          renderButton: (element: HTMLElement, config: object) => void;
        };
      };
    };
  }
}

interface LoginPageProps {
  onSuccess?: (token: string) => void;
}

export default function LoginPage({ onSuccess }: LoginPageProps) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const navigate = useNavigate();
  const isDark = useIsDark();

  const handleCredential = async (response: { credential: string }) => {
    setLoading(true);
    setError('');
    try {
      const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:5000';
      const apiBase = BASE_URL.endsWith('/api') ? BASE_URL : BASE_URL.replace(/\/$/, '') + '/api';
      const res = await fetch(`${apiBase}/auth/admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || 'Your account does not have admin access.');
      }
      const data = await res.json();
      if (onSuccess) {
        onSuccess(data.accessToken);
      } else {
        localStorage.setItem('admin-token', data.accessToken);
        navigate('/');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = () => {
      if (!window.google || !buttonRef.current || !GOOGLE_CLIENT_ID || initializedRef.current) return;
      initializedRef.current = true;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredential,
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        width: Math.max(Math.round(buttonRef.current.getBoundingClientRect().width), 360),
        text: 'signin_with',
      });
    };

    if (window.google) {
      init();
    } else {
      const interval = setInterval(() => {
        if (window.google) { clearInterval(interval); init(); }
      }, 100);
      return () => clearInterval(interval);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[color-mix(in_oklch,var(--primary)_10%,transparent)] via-background to-[color-mix(in_oklch,var(--primary)_5%,transparent)] flex items-center justify-center p-4">
      <div className="w-full max-w-md shadow-lg ring-1 ring-[var(--card-border)] bg-[var(--card)]/80 backdrop-blur-xl rounded-2xl">
        <div className="p-8 md:p-10 space-y-8">

          {/* Branding */}
          <div className="text-center space-y-3">
            <div className="flex justify-center mb-6">
              <img
                src={`${import.meta.env.BASE_URL}${isDark ? 'netflow-logo-white.png' : 'netflow-logo-black.png'}`}
                alt="NETFLOW"
                className="h-20 object-contain"
              />
            </div>
            <h1 className="text-4xl font-extrabold text-foreground tracking-tight">NETFLOW</h1>
            <p className="text-base text-muted-text">Admin Dashboard</p>
          </div>

          {/* Sign-in area */}
          <div className="flex flex-col items-center gap-4 pt-2">
            {!GOOGLE_CLIENT_ID && (
              <div className="w-full rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-700">
                Google Sign-In is not configured. Set{' '}
                <code className="font-mono font-medium">VITE_GOOGLE_CLIENT_ID</code> to enable it.
              </div>
            )}

            {error && (
              <div className="w-full rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {loading && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-white border-t-transparent" />
              </div>
            )}
            <div ref={buttonRef} className="flex justify-center w-full" />
          </div>

          {/* Footer */}
          {GOOGLE_CLIENT_ID && (
            <div className="border-t border-[var(--card-border)] pt-5 text-center text-[12px] text-muted-text">
              By continuing, you confirm you have administrator access to this system.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
