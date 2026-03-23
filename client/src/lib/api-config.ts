// In dev, Vite proxies /api to localhost:3001
// In production, /api routes to the same origin via Vercel rewrites
export const API_URL = '';
export const FRONTEND_URL = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';

/**
 * The origin of the API server (used for postMessage origin validation).
 * In dev: http://localhost:3001 (the actual Express server)
 * In production: https://api.kriptik.app
 *
 * OAuth callback HTML is served directly from the API server, so postMessage
 * events from the callback popup will have this origin.
 */
export const API_ORIGIN = import.meta.env.VITE_API_ORIGIN
  || (import.meta.env.DEV ? 'http://localhost:3001' : `https://api.${window.location.hostname}`);

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
