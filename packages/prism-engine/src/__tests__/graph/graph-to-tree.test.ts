import { describe, it, expect } from 'vitest';
import { graphToTree, getActiveNodes } from '../../graph/graph-to-tree.js';
import type { TreeNode } from '../../graph/graph-to-tree.js';
import type { PrismGraph, GraphNode, GraphEdge, Hub } from '../../types.js';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function makeNode(
  id: string,
  hubMemberships: string[],
  position: { x: number; y: number; z: number; width: number; height: number } = {
    x: 0, y: 0, z: 0, width: 100, height: 100,
  },
): GraphNode {
  return {
    id,
    type: 'element',
    elementType: 'button',
    caption: `Node ${id}`,
    captionVerified: false,
    hubMemberships,
    position,
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
 * Build a PrismGraph with 2 hubs, some shared nodes, and containment edges.
 *
 * hub_a: node-a1 (contains node-a2), node-a3, shared-s1
 * hub_b: node-b1, shared-s1
 *
 * Containment: node-a1 contains node-a2 (edge type 'contains')
 */
function makeTestGraph(): PrismGraph {
  const nodes: GraphNode[] = [
    makeNode('node-a1', ['hub_a']),
    makeNode('node-a2', ['hub_a']),
    makeNode('node-a3', ['hub_a']),
    makeNode('node-b1', ['hub_b']),
    makeNode('shared-s1', ['hub_a', 'hub_b']),
  ];

  const edges: GraphEdge[] = [
    {
      id: 'edge-contain-1',
      source: 'node-a1',
      target: 'node-a2',
      type: 'contains',
      metadata: {},
    },
  ];

  const hubs: Hub[] = [
    {
      id: 'hub_a',
      name: 'Hub A',
      route: '/a',
      layoutTemplate: 'single-column',
      nodeIds: ['node-a1', 'node-a2', 'node-a3', 'shared-s1'],
      sharedNodeIds: ['shared-s1'],
      authRequired: false,
      transitions: [{ targetHubId: 'hub_b', trigger: 'navigation', animation: 'fade' }],
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
    edges,
    hubs,
    metadata: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      totalHubs: hubs.length,
      totalSharedNodes: 1,
      estimatedDrawCalls: 5,
      atlasCount: 0,
      totalCodeSize: 0,
      generationTimeMs: 0,
      totalCost: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// graphToTree
// ---------------------------------------------------------------------------

describe('graphToTree', () => {
  it('returns root with hub id as nodeId', () => {
    const graph = makeTestGraph();
    const tree = graphToTree(graph, 'hub_a');

    expect(tree.nodeId).toBe('hub_a');
  });

  it('includes all hub nodes as children', () => {
    const graph = makeTestGraph();
    const tree = graphToTree(graph, 'hub_a');

    // hub_a has 4 nodes: node-a1, node-a2 (child of a1), node-a3, shared-s1
    // Top-level children should be: node-a1, node-a3, shared-s1
    // node-a2 is nested under node-a1 via containment
    const allNodeIds = collectAllNodeIds(tree);
    expect(allNodeIds).toContain('node-a1');
    expect(allNodeIds).toContain('node-a2');
    expect(allNodeIds).toContain('node-a3');
    expect(allNodeIds).toContain('shared-s1');
  });

  it('marks shared nodes with isShared: true', () => {
    const graph = makeTestGraph();
    const tree = graphToTree(graph, 'hub_a');

    const sharedNode = findTreeNode(tree, 'shared-s1');
    expect(sharedNode).toBeDefined();
    expect(sharedNode!.isShared).toBe(true);
  });

  it('non-shared nodes have isShared: false', () => {
    const graph = makeTestGraph();
    const tree = graphToTree(graph, 'hub_a');

    const normalNode = findTreeNode(tree, 'node-a1');
    expect(normalNode).toBeDefined();
    expect(normalNode!.isShared).toBe(false);
  });

  it('respects containment edges for nesting', () => {
    const graph = makeTestGraph();
    const tree = graphToTree(graph, 'hub_a');

    // node-a1 should contain node-a2 as a child
    const parentNode = findTreeNode(tree, 'node-a1');
    expect(parentNode).toBeDefined();
    const childIds = parentNode!.children.map((c) => c.nodeId);
    expect(childIds).toContain('node-a2');

    // node-a2 should NOT be a direct child of root
    const rootChildIds = tree.children.map((c) => c.nodeId);
    expect(rootChildIds).not.toContain('node-a2');
  });

  it('nodes without containment parent are direct children of root', () => {
    const graph = makeTestGraph();
    const tree = graphToTree(graph, 'hub_a');

    const rootChildIds = tree.children.map((c) => c.nodeId);
    // node-a1, node-a3, and shared-s1 have no containment parent
    expect(rootChildIds).toContain('node-a1');
    expect(rootChildIds).toContain('node-a3');
    expect(rootChildIds).toContain('shared-s1');
  });

  it('returns empty children for unknown hub', () => {
    const graph = makeTestGraph();
    const tree = graphToTree(graph, 'hub_unknown');

    expect(tree.nodeId).toBe('hub_unknown');
    expect(tree.children).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getActiveNodes
// ---------------------------------------------------------------------------

describe('getActiveNodes', () => {
  it('returns all nodes in the hub', () => {
    const graph = makeTestGraph();
    const active = getActiveNodes(graph, 'hub_a');

    const ids = active.map((n) => n.id);
    expect(ids).toContain('node-a1');
    expect(ids).toContain('node-a2');
    expect(ids).toContain('node-a3');
  });

  it('includes shared nodes', () => {
    const graph = makeTestGraph();
    const active = getActiveNodes(graph, 'hub_a');

    const ids = active.map((n) => n.id);
    expect(ids).toContain('shared-s1');
  });

  it('returns empty for unknown hub', () => {
    const graph = makeTestGraph();
    const active = getActiveNodes(graph, 'hub_unknown');

    expect(active).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectAllNodeIds(tree: TreeNode): string[] {
  const ids: string[] = [];
  function walk(node: TreeNode): void {
    // Skip root hub node from the collection
    if (node !== tree || node.children.length === 0) {
      ids.push(node.nodeId);
    }
    for (const child of node.children) {
      walk(child);
    }
  }
  for (const child of tree.children) {
    walk(child);
  }
  return ids;
}

function findTreeNode(tree: TreeNode, nodeId: string): TreeNode | undefined {
  if (tree.nodeId === nodeId) return tree;
  for (const child of tree.children) {
    const found = findTreeNode(child, nodeId);
    if (found) return found;
  }
  return undefined;
}
