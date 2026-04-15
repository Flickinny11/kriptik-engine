/**
 * Tests for Phase 9: Editing & Iteration invariants.
 *
 * Validates:
 * - Editing a node regenerates ONLY that node's code
 * - Neighbor nodes are NOT regenerated
 * - Graph edges preserved unless edit explicitly changes relationships
 * - Atlas is NOT repacked (node's region stays the same)
 * - Graph version increments
 */

import { describe, it, expect } from 'vitest';
import type {
  PrismGraph,
  GraphNode,
  GraphEdge,
  Hub,
  GraphMetadata,
} from '@kriptik/shared-interfaces';

function makeNode(id: string, overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    type: 'element',
    elementType: 'button',
    caption: `Caption for ${id}`,
    captionVerified: true,
    hubMemberships: ['hub-1'],
    position: { x: 0, y: 0, z: 0, width: 100, height: 50 },
    visualSpec: {
      description: `Visual spec for ${id}`,
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
    code: `function createNode() { /* ${id} */ }`,
    codeHash: `hash-${id}`,
    verificationScore: 0.92,
    imageUrl: null,
    atlasRegion: { atlasIndex: 0, x: 10, y: 20, width: 100, height: 50 },
    dependencies: [],
    status: 'verified',
    ...overrides,
  };
}

function makeGraph(): PrismGraph {
  const nodes: GraphNode[] = [
    makeNode('node-a'),
    makeNode('node-b'),
    makeNode('node-c'),
  ];

  const edges: GraphEdge[] = [
    { id: 'edge-1', source: 'node-a', target: 'node-b', type: 'contains', metadata: {} },
    { id: 'edge-2', source: 'node-b', target: 'node-c', type: 'navigates-to', metadata: {} },
  ];

  const hubs: Hub[] = [
    {
      id: 'hub-1',
      name: 'Home',
      route: '/',
      layoutTemplate: 'single-column',
      nodeIds: ['node-a', 'node-b', 'node-c'],
      sharedNodeIds: [],
      authRequired: false,
      transitions: [],
      metadata: {},
    },
  ];

  const metadata: GraphMetadata = {
    totalNodes: 3,
    totalEdges: 2,
    totalHubs: 1,
    totalSharedNodes: 0,
    estimatedDrawCalls: 3,
    atlasCount: 1,
    totalCodeSize: 300,
    generationTimeMs: 1000,
    totalCost: 0.05,
  };

  return {
    id: 'graph-1',
    planId: 'plan-1',
    projectId: 'project-1',
    version: 1,
    nodes,
    edges,
    hubs,
    metadata,
  };
}

/**
 * Simulates the node edit logic from the server route:
 * applies changes to the target node, clears its code, increments version.
 * Returns the new graph without mutating the original.
 */
function applyNodeEdit(
  graph: PrismGraph,
  nodeId: string,
  changes: { caption?: string; visualSpec?: Partial<GraphNode['visualSpec']> },
): PrismGraph {
  const newVersion = graph.version + 1;

  const updatedNodes = graph.nodes.map((n) => {
    if (n.id !== nodeId) return n; // Neighbor untouched
    const updated = { ...n };
    if (changes.caption != null) updated.caption = changes.caption;
    if (changes.visualSpec != null) {
      updated.visualSpec = { ...updated.visualSpec, ...changes.visualSpec };
    }
    // Clear code for regeneration
    updated.code = null;
    updated.codeHash = null;
    updated.verificationScore = null;
    updated.status = 'pending';
    return updated;
  });

  return {
    ...graph,
    version: newVersion,
    nodes: updatedNodes,
    // Edges preserved — not modified during edit
    // Hubs preserved — not modified during edit
  };
}

describe('Node editing invariants', () => {
  it('editing a node clears only that node\'s code', () => {
    const graph = makeGraph();
    const edited = applyNodeEdit(graph, 'node-b', { caption: 'New caption for B' });

    // Target node has cleared code
    const editedNode = edited.nodes.find((n) => n.id === 'node-b')!;
    expect(editedNode.code).toBeNull();
    expect(editedNode.codeHash).toBeNull();
    expect(editedNode.verificationScore).toBeNull();
    expect(editedNode.status).toBe('pending');
    expect(editedNode.caption).toBe('New caption for B');
  });

  it('neighbor nodes are NOT regenerated', () => {
    const graph = makeGraph();
    const edited = applyNodeEdit(graph, 'node-b', { caption: 'Changed' });

    // node-a and node-c should be completely unchanged
    const nodeA = edited.nodes.find((n) => n.id === 'node-a')!;
    const nodeC = edited.nodes.find((n) => n.id === 'node-c')!;

    expect(nodeA.code).toBe('function createNode() { /* node-a */ }');
    expect(nodeA.codeHash).toBe('hash-node-a');
    expect(nodeA.verificationScore).toBe(0.92);
    expect(nodeA.status).toBe('verified');

    expect(nodeC.code).toBe('function createNode() { /* node-c */ }');
    expect(nodeC.codeHash).toBe('hash-node-c');
    expect(nodeC.verificationScore).toBe(0.92);
    expect(nodeC.status).toBe('verified');
  });

  it('graph edges are preserved during edit', () => {
    const graph = makeGraph();
    const edited = applyNodeEdit(graph, 'node-b', { caption: 'Changed' });

    expect(edited.edges).toEqual(graph.edges);
    expect(edited.edges).toHaveLength(2);
    expect(edited.edges[0].type).toBe('contains');
    expect(edited.edges[1].type).toBe('navigates-to');
  });

  it('atlas regions are NOT repacked during edit', () => {
    const graph = makeGraph();
    const edited = applyNodeEdit(graph, 'node-b', { caption: 'Changed' });

    // All atlas regions should be identical to original
    for (const node of edited.nodes) {
      const original = graph.nodes.find((n) => n.id === node.id)!;
      expect(node.atlasRegion).toEqual(original.atlasRegion);
    }
  });

  it('graph version increments on edit', () => {
    const graph = makeGraph();
    expect(graph.version).toBe(1);

    const edited = applyNodeEdit(graph, 'node-b', { caption: 'Changed' });
    expect(edited.version).toBe(2);

    const editedAgain = applyNodeEdit(edited, 'node-a', { caption: 'Also changed' });
    expect(editedAgain.version).toBe(3);
  });

  it('hubs are preserved during edit', () => {
    const graph = makeGraph();
    const edited = applyNodeEdit(graph, 'node-b', { caption: 'Changed' });

    expect(edited.hubs).toEqual(graph.hubs);
    expect(edited.hubs).toHaveLength(1);
    expect(edited.hubs[0].nodeIds).toEqual(['node-a', 'node-b', 'node-c']);
  });

  it('original graph is not mutated', () => {
    const graph = makeGraph();
    const originalNodeB = graph.nodes.find((n) => n.id === 'node-b')!;
    const originalCode = originalNodeB.code;

    applyNodeEdit(graph, 'node-b', { caption: 'Changed' });

    // Original should be untouched
    expect(graph.version).toBe(1);
    expect(graph.nodes.find((n) => n.id === 'node-b')!.code).toBe(originalCode);
  });
});
