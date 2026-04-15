import { describe, it, expect } from 'vitest';
import { runConvergenceGate } from '../../backend/convergence-gate.js';
import type { PrismGraph } from '../../types.js';
import type { BackendResult } from '../../backend/convergence-gate.js';

function makeGraph(overrides?: Partial<PrismGraph>): PrismGraph {
  return {
    id: 'graph_1',
    planId: 'plan_1',
    projectId: 'proj_1',
    version: 1,
    nodes: [
      {
        id: 'node_submit_btn',
        type: 'element',
        elementType: 'button',
        caption: 'A lime green submit button, 200x48px, pill-shaped.',
        captionVerified: false,
        hubMemberships: ['hub_form'],
        position: { x: 100, y: 400, z: 1, width: 200, height: 48 },
        visualSpec: {
          description: 'Lime green pill button',
          colors: { primary: '#84cc16', text: '#ffffff' },
          typography: { fontFamily: 'Inter', fontSize: 16, fontWeight: 600 },
          spacing: {},
          borders: { radius: '24px' },
          effects: {},
          animation: null,
          textContent: [],
        },
        behaviorSpec: {
          interactions: [
            { event: 'click', action: 'api-call', targetHubId: undefined },
          ],
          dataBindings: [],
          stateManagement: null,
          apiCalls: [
            {
              endpointPath: '/api/users',
              method: 'POST',
              inputMapping: { name: 'form.name', email: 'form.email' },
              outputMapping: { result: 'response.data' },
              errorHandling: 'toast',
            },
          ],
          accessibilityRole: 'button',
          tabIndex: 0,
        },
        code: null,
        codeHash: null,
        verificationScore: null,
        imageUrl: null,
        atlasRegion: null,
        dependencies: [],
        status: 'pending',
      },
      {
        id: 'node_user_list',
        type: 'element',
        elementType: 'table',
        caption: 'A data table displaying users with columns: name, email, role.',
        captionVerified: false,
        hubMemberships: ['hub_dashboard'],
        position: { x: 0, y: 0, z: 1, width: 800, height: 600 },
        visualSpec: {
          description: 'User data table',
          colors: { primary: '#ffffff' },
          typography: {},
          spacing: {},
          borders: { radius: '8px' },
          effects: {},
          animation: null,
          textContent: [],
        },
        behaviorSpec: {
          interactions: [],
          dataBindings: [],
          stateManagement: null,
          apiCalls: [
            {
              endpointPath: '/api/users',
              method: 'GET',
              inputMapping: {},
              outputMapping: { users: 'response.items' },
              errorHandling: 'inline',
            },
          ],
          accessibilityRole: 'table',
          tabIndex: 0,
        },
        code: null,
        codeHash: null,
        verificationScore: null,
        imageUrl: null,
        atlasRegion: null,
        dependencies: [],
        status: 'pending',
      },
    ],
    edges: [],
    hubs: [
      {
        id: 'hub_form',
        name: 'Create User',
        route: '/users/new',
        layoutTemplate: 'single-column',
        nodeIds: ['node_submit_btn'],
        sharedNodeIds: [],
        authRequired: true,
        transitions: [],
        metadata: {},
      },
      {
        id: 'hub_dashboard',
        name: 'Dashboard',
        route: '/dashboard',
        layoutTemplate: 'dashboard',
        nodeIds: ['node_user_list'],
        sharedNodeIds: [],
        authRequired: false,
        transitions: [],
        metadata: {},
      },
    ],
    metadata: {
      totalNodes: 2,
      totalEdges: 0,
      totalHubs: 2,
      totalSharedNodes: 0,
      estimatedDrawCalls: 2,
      atlasCount: 0,
      totalCodeSize: 0,
      generationTimeMs: 0,
      totalCost: 0,
    },
    ...overrides,
  };
}

function makeBackend(overrides?: Partial<BackendResult>): BackendResult {
  return {
    endpoints: [
      { path: '/api/users', method: 'GET', auth: false, inputSchema: 'paginationInput' },
      { path: '/api/users', method: 'POST', auth: true, inputSchema: 'createUserSchema', outputSchema: 'userSchema' },
      { path: '/api/users/:id', method: 'DELETE', auth: true, inputSchema: 'idInput' },
    ],
    zodSchemas: 'export const paginationInput = z.object({}); export const createUserSchema = z.object({}); export const userSchema = z.object({}); export const idInput = z.object({});',
    ...overrides,
  };
}

describe('runConvergenceGate', () => {
  it('passes when all frontend calls have backend handlers', () => {
    const result = runConvergenceGate(makeGraph(), makeBackend());

    expect(result.passed).toBe(true);
    expect(result.checkedEndpoints).toBe(2);
    expect(result.matchedEndpoints).toBe(2);
    expect(result.issues.filter(i => i.severity === 'error')).toHaveLength(0);
  });

  it('fails when a frontend call has no backend handler', () => {
    const backend = makeBackend({
      endpoints: [
        { path: '/api/users', method: 'GET', auth: false },
      ],
    });
    const result = runConvergenceGate(makeGraph(), backend);

    expect(result.passed).toBe(false);
    const missing = result.issues.filter(i => i.type === 'missing_backend_handler');
    expect(missing.length).toBeGreaterThan(0);
    expect(missing[0].message).toContain('POST /api/users');
  });

  it('warns on auth inconsistency', () => {
    const backend = makeBackend({
      endpoints: [
        { path: '/api/users', method: 'GET', auth: false },
        { path: '/api/users', method: 'POST', auth: false },
      ],
    });
    const result = runConvergenceGate(makeGraph(), backend);

    const authIssues = result.issues.filter(i => i.type === 'auth_inconsistency');
    expect(authIssues.length).toBeGreaterThan(0);
    expect(authIssues[0].message).toContain('auth-required hub');
  });

  it('reports missing Zod schema references', () => {
    const backend = makeBackend({
      endpoints: [
        { path: '/api/users', method: 'GET', auth: false, inputSchema: 'nonExistentSchema' },
        { path: '/api/users', method: 'POST', auth: true },
      ],
      zodSchemas: '',
    });
    const result = runConvergenceGate(makeGraph(), backend);

    const schemaIssues = result.issues.filter(i => i.type === 'missing_schema');
    expect(schemaIssues.length).toBeGreaterThan(0);
    expect(schemaIssues[0].message).toContain('nonExistentSchema');
  });

  it('matches parameterized paths', () => {
    const graph = makeGraph();
    graph.nodes[1].behaviorSpec!.apiCalls = [
      {
        endpointPath: '/api/users/:id',
        method: 'GET',
        inputMapping: { id: 'route.params.id' },
        outputMapping: { user: 'response' },
        errorHandling: 'toast',
      },
    ];

    const backend = makeBackend({
      endpoints: [
        { path: '/api/users', method: 'POST', auth: true },
        { path: '/api/users/:id', method: 'GET', auth: false },
      ],
    });

    const result = runConvergenceGate(graph, backend);
    expect(result.matchedEndpoints).toBe(2);
  });

  it('handles graph with no API calls', () => {
    const graph = makeGraph();
    for (const node of graph.nodes) {
      node.behaviorSpec!.apiCalls = [];
    }

    const result = runConvergenceGate(graph, makeBackend());
    expect(result.passed).toBe(true);
    expect(result.checkedEndpoints).toBe(0);
  });
});
