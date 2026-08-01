import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface LoginPageProps {
  onSuccess?: (token: string) => void;
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.66-.22-2.45H12v4.63h6.47c-.28 1.5-1.13 2.77-2.4 3.63v3.02h3.88c2.27-2.09 3.57-5.17 3.57-8.83z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3.02c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11C3.25 21.3 7.29 24 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.27a7.2 7.2 0 010-4.54V6.62H1.27a12 12 0 000 10.76l4-3.11z" />
      <path fill="#EA4335" d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.29 0 3.25 2.7 1.27 6.62l4 3.11C6.22 6.88 8.87 4.77 12 4.77z" />
    </svg>
  );
}

export default function LoginPage({ onSuccess }: LoginPageProps) {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleDemoSignIn = async () => {
    setLoading(true);
    // Brief artificial delay so the sign-in doesn't feel instant/fake.
    await new Promise(resolve => setTimeout(resolve, 900));
    const payload = { sub: 'admin@netflow.demo', name: 'Admin Netflow', email: 'admin@netflow.demo' };
    const token = `demo.${btoa(JSON.stringify(payload))}.sig`;
    if (onSuccess) {
      onSuccess(token);
    } else {
      localStorage.setItem('admin-token', token);
      navigate('/');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[color-mix(in_oklch,var(--primary)_10%,transparent)] via-background to-[color-mix(in_oklch,var(--primary)_5%,transparent)] flex items-center justify-center p-4">
      <div className="w-full max-w-md shadow-lg ring-1 ring-[var(--card-border)] bg-[var(--card)]/80 backdrop-blur-xl rounded-2xl">
        <div className="p-6 sm:p-8 md:p-10 space-y-6 sm:space-y-8">

          {/* Branding */}
          <div className="text-center space-y-3">
            <div className="flex justify-center mb-6">
              <img
                src={`${import.meta.env.BASE_URL}netflow-logo-black.png`}
                alt="NETFLOW"
                className="h-20 object-contain"
              />
            </div>
            <h1 className="text-4xl font-extrabold text-foreground tracking-tight">NETFLOW</h1>
            <p className="text-base text-muted-text">Admin Dashboard</p>
          </div>

          {/* Sign-in area */}
          <div className="flex flex-col items-center gap-4 pt-2">
            {loading && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-white border-t-transparent" />
              </div>
            )}
            <button
              type="button"
              onClick={() => void handleDemoSignIn()}
              disabled={loading}
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-60"
            >
              <GoogleIcon />
              {loading ? 'Signing in...' : 'Continue with Google'}
            </button>
          </div>

          {/* Footer */}
          <div className="border-t border-[var(--card-border)] pt-5 text-center text-[12px] text-muted-text">
            By continuing, you confirm you have administrator access to this system.
          </div>
        </div>
      </div>
    </div>
  );
}
