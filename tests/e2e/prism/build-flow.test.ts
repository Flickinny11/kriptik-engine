/**
 * E2E test: Prism build flow.
 *
 * Tests the full user journey:
 *   User creates project → selects Prism engine → enters prompt
 *   → receives plan → approves plan → build completes → preview available
 *
 * This test validates the integration between:
 *   - Project creation with engineType='prism'
 *   - Plan generation via /api/prism/build
 *   - Plan approval via /api/prism/plan/approve
 *   - SSE event flow (prism_* events)
 *   - Preview URL delivery via prism_preview_ready event
 *
 * Requires: running server on localhost:3001, Modal deployment
 * Skip in CI unless PRISM_E2E=true is set.
 */

import { describe, it, expect, beforeAll } from 'vitest';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3001';
const SKIP_E2E = !process.env.PRISM_E2E;

describe.skipIf(SKIP_E2E)('Prism build flow E2E', () => {
  let authCookie: string;
  let projectId: string;

  beforeAll(async () => {
    // Authenticate — uses test credentials from env
    const loginRes = await fetch(`${API_BASE}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: process.env.TEST_USER_EMAIL || 'test@kriptik.app',
        password: process.env.TEST_USER_PASSWORD || 'test-password',
      }),
    });
    const cookies = loginRes.headers.get('set-cookie');
    authCookie = cookies || '';
  });

  it('creates a project with prism engine type', async () => {
    const res = await fetch(`${API_BASE}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie,
      },
      body: JSON.stringify({
        name: 'E2E Test Prism Project',
        engineType: 'prism',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    projectId = data.id || data.project?.id;
    expect(projectId).toBeTruthy();
  });

  it('starts a prism build and receives plan', async () => {
    const res = await fetch(`${API_BASE}/api/prism/build`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie,
      },
      body: JSON.stringify({
        projectId,
        prompt: 'A simple landing page with a hero section, navigation bar, and contact form',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('planning');
  });

  it('receives plan via SSE events', async () => {
    // Listen for SSE events until we get prism_plan_generated
    const eventPromise = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for plan event')), 60000);

      const controller = new AbortController();
      fetch(`${API_BASE}/api/events/stream?projectId=${projectId}`, {
        headers: { Cookie: authCookie },
        signal: controller.signal,
      }).then(async (res) => {
        const reader = res.body?.getReader();
        if (!reader) { reject(new Error('No reader')); return; }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.slice(6));
                if (event.type === 'prism_plan_generated') {
                  clearTimeout(timeout);
                  controller.abort();
                  resolve(event);
                  return;
                }
              } catch {
                // Skip non-JSON lines
              }
            }
          }
        }
      }).catch((err) => {
        if (err.name !== 'AbortError') reject(err);
      });
    });

    const planEvent = await eventPromise;
    expect(planEvent.type).toBe('prism_plan_generated');
  });

  it('approves plan and build starts', async () => {
    // Get the plan first
    const planRes = await fetch(`${API_BASE}/api/prism/plan/${projectId}`, {
      headers: { Cookie: authCookie },
    });
    expect(planRes.status).toBe(200);
    const plan = await planRes.json();

    // Approve the plan
    const approveRes = await fetch(`${API_BASE}/api/prism/plan/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie,
      },
      body: JSON.stringify({ projectId, planId: plan.id }),
    });

    expect(approveRes.status).toBe(200);
    const data = await approveRes.json();
    expect(data.status).toBe('generating');
  });

  it('receives build complete and preview URL via SSE', async () => {
    // Listen for prism_build_complete or prism_preview_ready
    const eventPromise = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Timeout waiting for build complete')),
        300000, // 5 minutes for full build
      );

      const controller = new AbortController();
      fetch(`${API_BASE}/api/events/stream?projectId=${projectId}`, {
        headers: { Cookie: authCookie },
        signal: controller.signal,
      }).then(async (res) => {
        const reader = res.body?.getReader();
        if (!reader) { reject(new Error('No reader')); return; }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.slice(6));
                if (event.type === 'prism_build_complete' || event.type === 'prism_preview_ready') {
                  clearTimeout(timeout);
                  controller.abort();
                  resolve(event);
                  return;
                }
              } catch {
                // Skip non-JSON lines
              }
            }
          }
        }
      }).catch((err) => {
        if (err.name !== 'AbortError') reject(err);
      });
    });

    const buildEvent = await eventPromise;
    expect(['prism_build_complete', 'prism_preview_ready']).toContain(buildEvent.type);
  });
});
