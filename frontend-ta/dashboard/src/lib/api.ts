let BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

// Ensure base URL always points to the /api proxy on the server
if (BASE_URL && !BASE_URL.endsWith('/api')) {
  BASE_URL = BASE_URL.replace(/\/$/, '') + '/api';
}

export async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('admin-token');
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem('admin-token');
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
    const errText = await response.text();
    throw new Error(`API error (${response.status}): ${errText}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}
