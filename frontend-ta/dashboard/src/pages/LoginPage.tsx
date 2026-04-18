import { useState, useEffect, useRef } from 'react';
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

export default function LoginPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const navigate = useNavigate();

  const handleCredential = async (response: { credential: string }) => {
    setLoading(true);
    setError('');
    try {
      const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
      const res = await fetch(`${BASE_URL}/auth/admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || 'Your account does not have admin access.');
      }
      const data = await res.json();
      localStorage.setItem('admin-token', data.accessToken);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Sign-in failed. Please try again.');
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
        width: buttonRef.current.offsetWidth || 360,
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
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4">
          <img
            src="/netflow-logo-black.png"
            alt="NETFLOW"
            className="h-12 object-contain"
          />
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="mt-1 text-sm text-gray-500">
              Sign in with your administrator Google account.
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-gray-900/5">
          {!GOOGLE_CLIENT_ID && (
            <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-700">
              Google Sign-In is not configured. Set <code className="font-mono font-medium">VITE_GOOGLE_CLIENT_ID</code> to enable it.
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="ml-2 text-sm text-gray-500">Verifying...</span>
            </div>
          ) : (
            <div ref={buttonRef} className="flex justify-center" />
          )}
        </div>

      </div>
    </div>
  );
}
