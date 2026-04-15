import { describe, it, expect } from 'vitest';
import {
  CODEGEN_SYSTEM_PROMPT,
  buildNeighborContext,
  buildNodeSpec,
  buildUserMessage,
} from '../../codegen/prompt-builder.js';
import type {
  GraphNode,
  PrismGraph,
  GraphEdge,
  Hub,
  GraphMetadata,
  NodeVisualSpec,
  NodeBehaviorSpec,
} from '../../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
      description: 'test',
      colors: { primary: '#000' },
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
    ...overrides,
  };
}

function makeGraph(): PrismGraph {
  return {
    id: 'graph-1',
    planId: 'plan-1',
    projectId: 'proj-1',
    version: 1,
    nodes: [makeNode('node-a'), makeNode('node-b'), makeNode('node-c')],
    edges: [
      {
        id: 'e1',
        source: 'node-a',
        target: 'node-b',
        type: 'contains',
        metadata: {},
      },
      {
        id: 'e2',
        source: 'node-b',
        target: 'node-c',
        type: 'navigates-to',
        metadata: {},
      },
    ],
    hubs: [
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
    ],
    metadata: {
      totalNodes: 3,
      totalEdges: 2,
      totalHubs: 1,
      totalSharedNodes: 0,
      estimatedDrawCalls: 3,
      atlasCount: 0,
      totalCodeSize: 0,
      generationTimeMs: 0,
      totalCost: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// CODEGEN_SYSTEM_PROMPT
// ---------------------------------------------------------------------------

describe('CODEGEN_SYSTEM_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof CODEGEN_SYSTEM_PROMPT).toBe('string');
    expect(CODEGEN_SYSTEM_PROMPT.trim().length).toBeGreaterThan(0);
  });

  it('contains PixiJS v8 constraints', () => {
    expect(CODEGEN_SYSTEM_PROMPT).toContain('PixiJS v8');
  });

  it('contains createNode function requirement', () => {
    expect(CODEGEN_SYSTEM_PROMPT).toContain('createNode');
  });

  it('does NOT contain any per-node content (Invariant 9)', () => {
    // The system prompt must be identical for ALL nodes. It must not
    // contain any node IDs, captions, or element-specific text.
    expect(CODEGEN_SYSTEM_PROMPT).not.toMatch(/node-[a-z]/);
    expect(CODEGEN_SYSTEM_PROMPT).not.toMatch(/Caption for/);
    expect(CODEGEN_SYSTEM_PROMPT).not.toMatch(/hub-\d/);
    // Should not contain any JSON-like spec objects
    expect(CODEGEN_SYSTEM_PROMPT).not.toContain('visualSpec');
    expect(CODEGEN_SYSTEM_PROMPT).not.toContain('behaviorSpec');
    expect(CODEGEN_SYSTEM_PROMPT).not.toContain('atlasRegion');
  });
});

// ---------------------------------------------------------------------------
// buildNeighborContext
// ---------------------------------------------------------------------------

describe('buildNeighborContext', () => {
  it('returns parent/sibling/children structure for contained node', () => {
    const graph = makeGraph();
    // node-b has parent node-a via 'contains' edge e1
    const ctx = buildNeighborContext('node-b', graph);

    expect(ctx).toContain('Parent:');
    expect(ctx).toContain('node-a');
    expect(ctx).toContain('Siblings:');
    expect(ctx).toContain('Children:');
  });

  it('returns "none" indicators for root nodes with no edges', () => {
    const graph = makeGraph();
    // node-a is the source (parent) of a 'contains' edge, not a target.
    // It has no parent via 'contains', no sibling via shared parent, no
    // children via contains where node-a is source -> that IS node-b.
    // So test with a graph that has no edges at all.
    const isolatedGraph: PrismGraph = {
      ...graph,
      edges: [],
      nodes: [makeNode('solo')],
    };
    const ctx = buildNeighborContext('solo', isolatedGraph);

    expect(ctx).toContain('Parent: none');
    expect(ctx).toContain('Siblings: none');
    expect(ctx).toContain('Children: none');
  });

  it('identifies children via contains edges where node is source', () => {
    const graph = makeGraph();
    // node-a is the source of edge e1 (contains node-b)
    const ctx = buildNeighborContext('node-a', graph);

    expect(ctx).toContain('Children:');
    expect(ctx).toContain('node-b');
  });

  it('identifies siblings that share the same parent', () => {
    const graph = makeGraph();
    // Add a second child under node-a so node-b and node-d are siblings
    graph.nodes.push(makeNode('node-d'));
    graph.edges.push({
      id: 'e3',
      source: 'node-a',
      target: 'node-d',
      type: 'contains',
      metadata: {},
    });

    const ctx = buildNeighborContext('node-b', graph);
    expect(ctx).toContain('Siblings:');
    expect(ctx).toContain('node-d');
  });
});

// ---------------------------------------------------------------------------
// buildNodeSpec
// ---------------------------------------------------------------------------

describe('buildNodeSpec', () => {
  it('extracts all fields from node', () => {
    const graph = makeGraph();
    const node = graph.nodes[0]!; // node-a
    const spec = buildNodeSpec(node, graph);

    expect(spec.nodeId).toBe('node-a');
    expect(spec.caption).toBe('Caption for node-a');
    expect(spec.visualSpec).toBe(node.visualSpec);
    expect(spec.behaviorSpec).toBe(node.behaviorSpec);
    expect(spec.atlasRegion).toBeNull();
    expect(typeof spec.neighborContext).toBe('string');
    expect(spec.neighborContext.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// buildUserMessage
// ---------------------------------------------------------------------------

describe('buildUserMessage', () => {
  it('includes ELEMENT SPECIFICATION header', () => {
    const graph = makeGraph();
    const spec = buildNodeSpec(graph.nodes[0]!, graph);
    const msg = buildUserMessage(spec);

    expect(msg).toContain('ELEMENT SPECIFICATION:');
  });

  it('includes VISUAL section', () => {
    const graph = makeGraph();
    const spec = buildNodeSpec(graph.nodes[0]!, graph);
    const msg = buildUserMessage(spec);

    expect(msg).toContain('VISUAL:');
  });

  it('includes BEHAVIOR section', () => {
    const graph = makeGraph();
    const spec = buildNodeSpec(graph.nodes[0]!, graph);
    const msg = buildUserMessage(spec);

    expect(msg).toContain('BEHAVIOR:');
  });

  it('includes NEIGHBORS section', () => {
    const graph = makeGraph();
    const spec = buildNodeSpec(graph.nodes[0]!, graph);
    const msg = buildUserMessage(spec);

    expect(msg).toContain('NEIGHBORS:');
  });

  it('includes ATLAS REGION section', () => {
    const graph = makeGraph();
    const spec = buildNodeSpec(graph.nodes[0]!, graph);
    const msg = buildUserMessage(spec);

    expect(msg).toContain('ATLAS REGION:');
  });

  it('formats atlas region when present', () => {
    const graph = makeGraph();
    const nodeWithAtlas = makeNode('node-atlas', {
      atlasRegion: {
        atlasIndex: 2,
        x: 128,
        y: 64,
        width: 256,
        height: 128,
      },
    });
    graph.nodes.push(nodeWithAtlas);

    const spec = buildNodeSpec(nodeWithAtlas, graph);
    const msg = buildUserMessage(spec);

    expect(msg).toContain('ATLAS REGION:');
    // Should contain atlas index and coordinates
    expect(msg).toContain('2');
    expect(msg).toContain('128');
    expect(msg).toContain('64');
    expect(msg).toContain('256');
    // Should NOT say "none" for atlas region
    expect(msg).not.toMatch(/ATLAS REGION:\s*\nnone/);
  });

  it('shows none for atlas region when absent', () => {
    const graph = makeGraph();
    const spec = buildNodeSpec(graph.nodes[0]!, graph);
    const msg = buildUserMessage(spec);

    expect(msg).toContain('none (no atlas region assigned)');
  });

  it('includes the node caption text in the message', () => {
    const graph = makeGraph();
    const spec = buildNodeSpec(graph.nodes[0]!, graph);
    const msg = buildUserMessage(spec);

    expect(msg).toContain('Caption for node-a');
  });
});
