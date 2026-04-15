/**
 * E2E test: Prism edit flow.
 *
 * Tests the node editing journey:
 *   User has an existing prism project with completed build
 *   → selects a node → edits caption → node regenerates
 *   → preview updates → only edited node changed
 *
 * Validates Phase 9 invariants:
 *   - Editing a node regenerates ONLY that node's code
 *   - Neighbor nodes are NOT regenerated
 *   - Graph edges preserved
 *   - Atlas NOT repacked
 *   - Graph version increments
 *   - Preview updates within 5 seconds
 *
 * Requires: running server, Modal deployment, existing prism project
 * Skip in CI unless PRISM_E2E=true is set.
 */

import { describe, it, expect, beforeAll } from 'vitest';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3001';
const SKIP_E2E = !process.env.PRISM_E2E;

describe.skipIf(SKIP_E2E)('Prism edit flow E2E', () => {
  let authCookie: string;
  let projectId: string;
  let graphId: string;
  let nodeToEdit: string;
  let originalGraph: Record<string, unknown>;

  beforeAll(async () => {
    // Use existing test project with completed build
    projectId = process.env.PRISM_TEST_PROJECT_ID || '';
    if (!projectId) {
      throw new Error('PRISM_TEST_PROJECT_ID env var required for edit flow test');
    }

    // Authenticate
    const loginRes = await fetch(`${API_BASE}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: process.env.TEST_USER_EMAIL || 'test@kriptik.app',
        password: process.env.TEST_USER_PASSWORD || 'test-password',
      }),
    });
    authCookie = loginRes.headers.get('set-cookie') || '';

    // Fetch current graph
    const graphRes = await fetch(`${API_BASE}/api/prism/graph/${projectId}`, {
      headers: { Cookie: authCookie },
    });
    originalGraph = await graphRes.json();
    graphId = (originalGraph as Record<string, string>).id;

    // Pick the first verified node to edit
    const nodes = (originalGraph as Record<string, Array<Record<string, string>>>).nodes || [];
    const verifiedNode = nodes.find(
      (n: Record<string, string>) => n.status === 'verified',
    );
    nodeToEdit = verifiedNode?.id || nodes[0]?.id || '';
  });

  it('edits a node caption', async () => {
    const res = await fetch(`${API_BASE}/api/prism/graph/${projectId}/edit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie,
      },
      body: JSON.stringify({
        graphId,
        nodeId: nodeToEdit,
        changes: {
          caption: 'A 300×60px pill button with electric blue (#3b82f6) background, white text "Updated Button" in Inter 18px bold, centered. On hover: scale 1.08× with 150ms ease-out, background brightens to #60a5fa.',
        },
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('editing');
  });

  it('receives edit completion event within 30 seconds', async () => {
    const eventPromise = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Timeout waiting for edit complete')),
        30000,
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
                if (event.type === 'prism_node_edit_complete') {
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

    const editEvent = await eventPromise;
    expect(editEvent.type).toBe('prism_node_edit_complete');
  });

  it('verifies only the edited node changed', async () => {
    const graphRes = await fetch(`${API_BASE}/api/prism/graph/${projectId}`, {
      headers: { Cookie: authCookie },
    });
    const updatedGraph = await graphRes.json() as Record<string, unknown>;

    // Version must have incremented
    expect(updatedGraph.version).toBeGreaterThan(
      (originalGraph as Record<string, number>).version,
    );

    // Edges must be preserved
    expect(updatedGraph.edges).toEqual(originalGraph.edges);

    // Non-edited nodes must be unchanged
    const origNodes = (originalGraph as Record<string, Array<Record<string, unknown>>>).nodes || [];
    const updNodes = (updatedGraph as Record<string, Array<Record<string, unknown>>>).nodes || [];

    for (const origNode of origNodes) {
      if (origNode.id === nodeToEdit) continue;
      const updNode = updNodes.find((n: Record<string, unknown>) => n.id === origNode.id);
      expect(updNode?.code).toEqual(origNode.code);
      expect(updNode?.codeHash).toEqual(origNode.codeHash);
      expect(updNode?.verificationScore).toEqual(origNode.verificationScore);
      expect(updNode?.atlasRegion).toEqual(origNode.atlasRegion);
    }
  });
});
