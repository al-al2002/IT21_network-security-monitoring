// lib/api.js
// Thin fetch wrapper. Why a wrapper?
//   1. We always want JSON responses and JSON request bodies
//   2. We always want to attach the JWT from localStorage
//   3. We want one place to handle errors (not try/catch in every component)
//
// Usage:
//   const data = await api.get('/events');
//   await api.post('/auth/login', { email, password });

const API_BASE = '/api'; // Vite proxy forwards /api/* to the Express backend on :5000

const getHeaders = (extra = {}) => {
  const token = localStorage.getItem('netguard_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
};

const OFFLINE_MESSAGE =
  'Cannot reach the NetGuard server. Make sure the API is running on port 5000 ' +
  '(run "npm run dev" from the netguard folder to start both halves).';

const handleResponse = async (res) => {
  // Try to parse JSON, but fall back gracefully if the body isn't JSON.
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // 503 is what the Vite proxy returns when the backend is not listening.
    if (res.status === 503 && !data?.message) throw new Error(OFFLINE_MESSAGE);
    // Surface the server's error message if there is one
    const message = data?.message || `Request failed: ${res.status}`;
    throw new Error(message);
  }
  return data;
};

// fetch() only rejects on network-level failures. Without this, a backend that
// is simply not running surfaces to the user as the browser's opaque
// "Failed to fetch", which says nothing about what to do about it.
const request = (path, init) =>
  fetch(`${API_BASE}${path}`, init).then(handleResponse, (err) => {
    if (err instanceof TypeError) throw new Error(OFFLINE_MESSAGE);
    throw err;
  });

export const api = {
  get: (path) => request(path, { method: 'GET', headers: getHeaders() }),

  post: (path, body) =>
    request(path, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
    }),

  patch: (path, body) =>
    request(path, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(body),
    }),

  delete: (path) => request(path, { method: 'DELETE', headers: getHeaders() }),
};
