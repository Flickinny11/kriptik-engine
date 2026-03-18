// In dev, Vite proxies /api to localhost:3001
// In production, /api routes to the same origin via Vercel rewrites
export const API_URL = '';
export const FRONTEND_URL = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';

export async function authenticatedFetch(url: string, options: RequestInit = {}) {
  return fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}
