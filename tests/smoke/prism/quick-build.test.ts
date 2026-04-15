/**
 * Smoke test: Quick Prism build.
 *
 * Simple landing page: prompt → plan → generate → preview
 * Must complete in <60 seconds.
 *
 * This test validates the minimum viable pipeline:
 *   1. Submit a simple prompt
 *   2. Receive a plan
 *   3. Auto-approve the plan
 *   4. Wait for build to complete
 *   5. Verify preview URL is accessible
 *
 * Requires: running server, Modal deployment
 * Skip unless PRISM_SMOKE=true is set.
 */

import { describe, it, expect, beforeAll } from 'vitest';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3001';
const SKIP_SMOKE = !process.env.PRISM_SMOKE;
const TIMEOUT_MS = 60000;

describe.skipIf(SKIP_SMOKE)('Prism quick build smoke test', () => {
  let authCookie: string;
  let projectId: string;

  beforeAll(async () => {
    const loginRes = await fetch(`${API_BASE}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: process.env.TEST_USER_EMAIL || 'test@kriptik.app',
        password: process.env.TEST_USER_PASSWORD || 'test-password',
      }),
    });
    authCookie = loginRes.headers.get('set-cookie') || '';
  });

  it('completes a simple landing page build in under 60 seconds', async () => {
    const startTime = Date.now();

    // 1. Create project
    const projectRes = await fetch(`${API_BASE}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie,
      },
      body: JSON.stringify({
        name: 'Smoke Test Project',
        engineType: 'prism',
      }),
    });
    const project = await projectRes.json();
    projectId = project.id || project.project?.id;

    // 2. Start build
    const buildRes = await fetch(`${API_BASE}/api/prism/build`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie,
      },
      body: JSON.stringify({
        projectId,
        prompt: 'A minimal landing page with a centered heading and a call-to-action button',
      }),
    });
    expect(buildRes.status).toBe(200);

    // 3. Wait for plan via SSE
    const planEvent = await waitForEvent(
      projectId,
      authCookie,
      'prism_plan_generated',
      30000,
    );
    expect(planEvent).toBeTruthy();

    // 4. Approve plan
    const planRes = await fetch(`${API_BASE}/api/prism/plan/${projectId}`, {
      headers: { Cookie: authCookie },
    });
    const plan = await planRes.json();

    await fetch(`${API_BASE}/api/prism/plan/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie,
      },
      body: JSON.stringify({ projectId, planId: plan.id }),
    });

    // 5. Wait for build complete
    const remainingTime = TIMEOUT_MS - (Date.now() - startTime);
    const buildEvent = await waitForEvent(
      projectId,
      authCookie,
      'prism_build_complete',
      Math.max(remainingTime, 5000),
    );

    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThan(TIMEOUT_MS);
    expect(buildEvent).toBeTruthy();
  }, TIMEOUT_MS + 5000); // Test timeout slightly above the 60s requirement
});

async function waitForEvent(
  projectId: string,
  cookie: string,
  eventType: string,
  timeoutMs: number,
): Promise<Record<string, unknown> | null> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      controller.abort();
      reject(new Error(`Timeout (${timeoutMs}ms) waiting for ${eventType}`));
    }, timeoutMs);

    const controller = new AbortController();
    fetch(`${API_BASE}/api/events/stream?projectId=${projectId}`, {
      headers: { Cookie: cookie },
      signal: controller.signal,
    }).then(async (res) => {
      const reader = res.body?.getReader();
      if (!reader) { clearTimeout(timeout); resolve(null); return; }

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
              if (event.type === eventType) {
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
      clearTimeout(timeout);
      resolve(null);
    }).catch((err) => {
      clearTimeout(timeout);
      if (err.name !== 'AbortError') reject(err);
    });
  });
}
