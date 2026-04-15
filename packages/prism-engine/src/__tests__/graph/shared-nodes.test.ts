import { describe, it, expect } from 'vitest';
import {
  reparentSharedNodes,
  getSharedNodes,
  isSharedNode,
} from '../../graph/shared-nodes.js';
import type { PrismGraph, GraphNode, Hub } from '../../types.js';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function makeNode(id: string, hubMemberships: string[]): GraphNode {
  return {
    id,
    type: 'element',
    elementType: 'button',
    caption: `Node ${id}`,
    captionVerified: false,
    hubMemberships,
    position: { x: 0, y: 0, z: 0, width: 100, height: 100 },
    visualSpec: {
      description: `Node ${id}`,
      colors: { primary: '#000000' },
      typography: {},
      spacing: {},
      borders: {},
      effects: {},
      animation: null,
      textContent: [],
    },
    behaviorSpec: {
      interactions: [],
      dataBindings: [],
      stateManagement: null,
      apiCalls: [],
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
  };
}

/**
 * Build a test graph with:
 *   hub_a: node-a1 (hub_a only), node-a2 (hub_a only), shared-s1 (hub_a + hub_b)
 *   hub_b: node-b1 (hub_b only), shared-s1 (hub_a + hub_b)
 */
function makeTestGraph(): PrismGraph {
  const nodes: GraphNode[] = [
    makeNode('node-a1', ['hub_a']),
    makeNode('node-a2', ['hub_a']),
    makeNode('node-b1', ['hub_b']),
    makeNode('shared-s1', ['hub_a', 'hub_b']),
  ];

  const hubs: Hub[] = [
    {
      id: 'hub_a',
      name: 'Hub A',
      route: '/a',
      layoutTemplate: 'single-column',
      nodeIds: ['node-a1', 'node-a2', 'shared-s1'],
      sharedNodeIds: ['shared-s1'],
      authRequired: false,
      transitions: [],
      metadata: { description: 'Hub A' },
    },
    {
      id: 'hub_b',
      name: 'Hub B',
      route: '/b',
      layoutTemplate: 'single-column',
      nodeIds: ['node-b1', 'shared-s1'],
      sharedNodeIds: ['shared-s1'],
      authRequired: false,
      transitions: [],
      metadata: { description: 'Hub B' },
    },
  ];

  return {
    id: 'graph-test',
    planId: 'plan-test',
    projectId: 'proj-test',
    version: 1,
    nodes,
    edges: [],
    hubs,
    metadata: {
      totalNodes: nodes.length,
      totalEdges: 0,
      totalHubs: hubs.length,
      totalSharedNodes: 1,
      estimatedDrawCalls: 4,
      atlasCount: 0,
      totalCodeSize: 0,
      generationTimeMs: 0,
      totalCost: 0,
    },
  };
}

/**
 * Build a graph with no shared nodes.
 */
function makeGraphNoShared(): PrismGraph {
  const nodes: GraphNode[] = [
    makeNode('node-a1', ['hub_a']),
    makeNode('node-b1', ['hub_b']),
  ];

  const hubs: Hub[] = [
    {
      id: 'hub_a',
      name: 'Hub A',
      route: '/a',
      layoutTemplate: 'single-column',
      nodeIds: ['node-a1'],
      sharedNodeIds: [],
      authRequired: false,
      transitions: [],
      metadata: { description: 'Hub A' },
    },
    {
      id: 'hub_b',
      name: 'Hub B',
      route: '/b',
      layoutTemplate: 'single-column',
      nodeIds: ['node-b1'],
      sharedNodeIds: [],
      authRequired: false,
      transitions: [],
      metadata: { description: 'Hub B' },
    },
  ];

  return {
    id: 'graph-test-noshared',
    planId: 'plan-test',
    projectId: 'proj-test',
    version: 1,
    nodes,
    edges: [],
    hubs,
    metadata: {
      totalNodes: nodes.length,
      totalEdges: 0,
      totalHubs: hubs.length,
      totalSharedNodes: 0,
      estimatedDrawCalls: 2,
      atlasCount: 0,
      totalCodeSize: 0,
      generationTimeMs: 0,
      totalCost: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// reparentSharedNodes
// ---------------------------------------------------------------------------

describe('reparentSharedNodes', () => {
  it('shared nodes persist between hubs', () => {
    const graph = makeTestGraph();
    const result = reparentSharedNodes(graph, 'hub_a', 'hub_b');

    expect(result.persist).toContain('shared-s1');
  });

  it('hub-specific nodes are removed when leaving', () => {
    const graph = makeTestGraph();
    const result = reparentSharedNodes(graph, 'hub_a', 'hub_b');

    // node-a1 and node-a2 are hub_a-only, should be removed
    expect(result.remove).toContain('node-a1');
    expect(result.remove).toContain('node-a2');
  });

  it('hub-specific nodes are added when entering', () => {
    const graph = makeTestGraph();
    const result = reparentSharedNodes(graph, 'hub_a', 'hub_b');

    // node-b1 is hub_b-only, should be added
    expect(result.add).toContain('node-b1');
  });

  it('returns empty arrays for unknown hubs', () => {
    const graph = makeTestGraph();
    const result = reparentSharedNodes(graph, 'hub_unknown_1', 'hub_unknown_2');

    expect(result.remove).toHaveLength(0);
    expect(result.add).toHaveLength(0);
    expect(result.persist).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getSharedNodes
// ---------------------------------------------------------------------------

describe('getSharedNodes', () => {
  it('returns only nodes with multiple hub memberships', () => {
    const graph = makeTestGraph();
    const shared = getSharedNodes(graph);

    expect(shared).toHaveLength(1);
    expect(shared[0].id).toBe('shared-s1');
  });

  it('returns empty for graph with no shared nodes', () => {
    const graph = makeGraphNoShared();
    const shared = getSharedNodes(graph);

    expect(shared).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// isSharedNode
// ---------------------------------------------------------------------------

describe('isSharedNode', () => {
  it('returns true for shared node', () => {
    const graph = makeTestGraph();
    expect(isSharedNode(graph, 'shared-s1')).toBe(true);
  });

  it('returns false for non-shared node', () => {
    const graph = makeTestGraph();
    expect(isSharedNode(graph, 'node-a1')).toBe(false);
  });

  it('returns false for unknown nodeId', () => {
    const graph = makeTestGraph();
    expect(isSharedNode(graph, 'nonexistent')).toBe(false);
  });
});
