import { describe, it, expect } from 'vitest';
import {
  REQUIRED_BUNDLE_FILES,
  validateBundleStructure,
  buildBundleManifest,
  validateGraphJson,
} from '../../assembly/bundler.js';
import type { PrismGraph, GraphNode } from '../../types.js';

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
    code: 'export function createNode() {}',
    codeHash: 'abc',
    verificationScore: 0.92,
    imageUrl: null,
    atlasRegion: { atlasIndex: 0, x: 0, y: 0, width: 100, height: 50 },
    dependencies: [],
    status: 'verified',
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
    edges: [],
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
      totalEdges: 0,
      totalHubs: 1,
      totalSharedNodes: 0,
      estimatedDrawCalls: 3,
      atlasCount: 1,
      totalCodeSize: 300,
      generationTimeMs: 1000,
      totalCost: 0,
    },
  };
}

function makeCompleteBundleFiles(graph: PrismGraph): string[] {
  return [
    'index.html',
    'app.js',
    'graph.json',
    'shared/manager.js',
    'shared/adapter.js',
    'shared/animations.js',
    'shared/state.js',
    ...graph.nodes.map((n) => `nodes/${n.id}.js`),
    'atlases/atlas-0.png',
  ];
}

// ---------------------------------------------------------------------------
// REQUIRED_BUNDLE_FILES
// ---------------------------------------------------------------------------

describe('REQUIRED_BUNDLE_FILES', () => {
  it('has exactly 7 required files', () => {
    expect(REQUIRED_BUNDLE_FILES).toHaveLength(7);
  });

  it('includes index.html, app.js, graph.json', () => {
    expect(REQUIRED_BUNDLE_FILES).toContain('index.html');
    expect(REQUIRED_BUNDLE_FILES).toContain('app.js');
    expect(REQUIRED_BUNDLE_FILES).toContain('graph.json');
  });

  it('includes all shared/ files', () => {
    expect(REQUIRED_BUNDLE_FILES).toContain('shared/manager.js');
    expect(REQUIRED_BUNDLE_FILES).toContain('shared/adapter.js');
    expect(REQUIRED_BUNDLE_FILES).toContain('shared/animations.js');
    expect(REQUIRED_BUNDLE_FILES).toContain('shared/state.js');
  });
});

// ---------------------------------------------------------------------------
// validateBundleStructure
// ---------------------------------------------------------------------------

describe('validateBundleStructure', () => {
  it('passes for complete bundle', () => {
    const graph = makeGraph();
    const files = makeCompleteBundleFiles(graph);
    const result = validateBundleStructure(files, graph);
    expect(result.valid).toBe(true);
    expect(result.missingFiles).toHaveLength(0);
  });

  it('fails when missing required file', () => {
    const graph = makeGraph();
    const files = makeCompleteBundleFiles(graph).filter(
      (f) => f !== 'index.html',
    );
    const result = validateBundleStructure(files, graph);
    expect(result.valid).toBe(false);
    expect(result.missingFiles).toContain('index.html');
  });

  it('fails when missing node file', () => {
    const graph = makeGraph();
    const files = makeCompleteBundleFiles(graph).filter(
      (f) => f !== 'nodes/node-b.js',
    );
    const result = validateBundleStructure(files, graph);
    expect(result.valid).toBe(false);
    expect(result.missingFiles).toContain('nodes/node-b.js');
  });

  it('fails when missing atlas file for graph with atlas regions', () => {
    const graph = makeGraph();
    // All nodes have atlasRegion set, so removing the atlas file should fail
    const files = makeCompleteBundleFiles(graph).filter(
      (f) => !f.startsWith('atlases/'),
    );
    const result = validateBundleStructure(files, graph);
    expect(result.valid).toBe(false);
    expect(result.missingFiles).toContain('atlases/atlas-0.png');
  });

  it('passes when no atlas needed', () => {
    const graph = makeGraph();
    // Set all atlas regions to null
    for (const node of graph.nodes) {
      node.atlasRegion = null;
    }
    // Remove atlas files from the bundle
    const files = makeCompleteBundleFiles(graph).filter(
      (f) => !f.startsWith('atlases/'),
    );
    const result = validateBundleStructure(files, graph);
    expect(result.valid).toBe(true);
    expect(result.missingFiles).toHaveLength(0);
  });

  it('warns about non-verified nodes with bundle files', () => {
    const graph = makeGraph();
    // Mark one node as failed (not verified, not pending)
    graph.nodes[1] = makeNode('node-b', { status: 'failed' });
    const files = makeCompleteBundleFiles(graph);
    const result = validateBundleStructure(files, graph);
    expect(result.warnings.some((w) => w.includes('node-b'))).toBe(true);
    expect(
      result.warnings.some((w) => w.includes("'failed'")),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildBundleManifest
// ---------------------------------------------------------------------------

describe('buildBundleManifest', () => {
  it('includes required files', () => {
    const graph = makeGraph();
    const manifest = buildBundleManifest(graph, 1);
    for (const file of REQUIRED_BUNDLE_FILES) {
      expect(manifest.requiredFiles).toContain(file);
    }
  });

  it('includes node files for verified nodes only', () => {
    const graph = makeGraph();
    // Mark one node as pending (not verified)
    graph.nodes[2] = makeNode('node-c', { status: 'pending' });
    const manifest = buildBundleManifest(graph, 1);
    expect(manifest.nodeFiles).toContain('nodes/node-a.js');
    expect(manifest.nodeFiles).toContain('nodes/node-b.js');
    expect(manifest.nodeFiles).not.toContain('nodes/node-c.js');
  });

  it('includes atlas files', () => {
    const graph = makeGraph();
    const manifest = buildBundleManifest(graph, 2);
    expect(manifest.atlasFiles).toContain('atlases/atlas-0.png');
    expect(manifest.atlasFiles).toContain('atlases/atlas-1.png');
    expect(manifest.atlasFiles).toHaveLength(2);
  });

  it('total count is correct', () => {
    const graph = makeGraph();
    const manifest = buildBundleManifest(graph, 1);
    const expectedTotal =
      manifest.requiredFiles.length +
      manifest.nodeFiles.length +
      manifest.atlasFiles.length;
    expect(manifest.totalExpectedFiles).toBe(expectedTotal);
  });

  it('estimates bundle size', () => {
    const graph = makeGraph();
    const manifest = buildBundleManifest(graph, 1);
    // BASE_SIZE_BYTES (50KB) + 3 nodes * PER_NODE_SIZE_BYTES (2KB) + 1 atlas * PER_ATLAS_SIZE_BYTES (16MB)
    const expected = 50 * 1024 + 3 * 2 * 1024 + 1 * 16 * 1024 * 1024;
    expect(manifest.estimatedSizeBytes).toBe(expected);
  });

  it('handles zero atlas count', () => {
    const graph = makeGraph();
    const manifest = buildBundleManifest(graph, 0);
    expect(manifest.atlasFiles).toHaveLength(0);
    // Size should be base + nodes only, no atlas contribution
    const expected = 50 * 1024 + 3 * 2 * 1024;
    expect(manifest.estimatedSizeBytes).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// validateGraphJson
// ---------------------------------------------------------------------------

describe('validateGraphJson', () => {
  it('passes for valid graph JSON', () => {
    const graph = makeGraph();
    expect(validateGraphJson(graph)).toBe(true);
  });

  it('fails for null', () => {
    expect(validateGraphJson(null)).toBe(false);
  });

  it('fails for non-object', () => {
    expect(validateGraphJson('not an object')).toBe(false);
    expect(validateGraphJson(42)).toBe(false);
    expect(validateGraphJson(true)).toBe(false);
  });

  it('fails for missing id field', () => {
    const graph = makeGraph();
    const { id: _, ...noId } = graph;
    expect(validateGraphJson(noId)).toBe(false);
  });

  it('fails for missing nodes array', () => {
    const graph = makeGraph();
    const { nodes: _, ...noNodes } = graph;
    expect(validateGraphJson(noNodes)).toBe(false);
  });

  it('fails for non-array nodes', () => {
    const graph = makeGraph();
    const broken = { ...graph, nodes: 'not-an-array' };
    expect(validateGraphJson(broken)).toBe(false);
  });

  it('fails for missing metadata object', () => {
    const graph = makeGraph();
    const { metadata: _, ...noMetadata } = graph;
    expect(validateGraphJson(noMetadata)).toBe(false);
  });
});
