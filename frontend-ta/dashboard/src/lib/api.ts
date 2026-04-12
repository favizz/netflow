const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

export async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('admin-api-key');
  const headers = new Headers(options.headers || {});
  
  // Set default content type
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Add auth header
  if (token) {
    headers.set('x-admin-key', token);
  }

  // Execute request
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // Handle unauthorized explicitly
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem('admin-api-key');
      // If we are already running in browser, just redirect
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
    const errText = await response.text();
    throw new Error(`API error (${response.status}): ${errText}`);
  }

  // Handle No Content
  if (response.status === 204) {
    return null;
  }

  return response.json();
}
