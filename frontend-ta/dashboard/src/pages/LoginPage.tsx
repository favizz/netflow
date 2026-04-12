import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { fetchApi } from '@/lib/api';

export default function LoginPage() {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    // Save to test immediately
    localStorage.setItem('admin-api-key', key);
    try {
      // Testing the key by reading unit list since it's available and valid
      await fetchApi('/unit'); 
      navigate('/');
    } catch (err: unknown) {
      setError('Invalid API key or network error');
      localStorage.removeItem('admin-api-key');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg border border-gray-200">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            <Lock className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Authentication</h1>
          <p className="mt-2 text-center text-sm text-gray-500">
            Enter your secure administrator API Key to access the dashboard controls.
          </p>
        </div>
        
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <input
              type="password"
              placeholder="Enter x-api-key..."
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="w-full rounded-md border border-gray-300 p-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>
          
          {error && <p className="text-sm font-medium text-red-600">{error}</p>}
          
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Login to Dashboard'}
          </button>
        </form>
      </div>
    </div>
  );
}
