import { describe, it, expect } from 'vitest';
import {
  buildDispatchBatch,
  validateGeneratedCode,
  extractCodeFromResponse,
} from '../../codegen/codegen-dispatch.js';
import { CODEGEN_SYSTEM_PROMPT } from '../../codegen/prompt-builder.js';
import type { GraphNode, PrismGraph } from '../../types.js';

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

function makeGraph(
  nodeOverrides: Partial<GraphNode>[] = [],
): PrismGraph {
  const nodes = [
    makeNode('node-a', nodeOverrides[0] ?? {}),
    makeNode('node-b', nodeOverrides[1] ?? {}),
    makeNode('node-c', nodeOverrides[2] ?? {}),
  ];
  return {
    id: 'graph-1',
    planId: 'plan-1',
    projectId: 'proj-1',
    version: 1,
    nodes,
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
// buildDispatchBatch
// ---------------------------------------------------------------------------

describe('buildDispatchBatch', () => {
  it('includes only pending and caption_verified nodes', () => {
    const graph = makeGraph([
      { status: 'pending' },
      { status: 'caption_verified' },
      { status: 'verified' },
    ]);

    const batch = buildDispatchBatch(graph);

    expect(batch).toHaveLength(2);
    const ids = batch.map((s) => s.nodeId);
    expect(ids).toContain('node-a');
    expect(ids).toContain('node-b');
    expect(ids).not.toContain('node-c');
  });

  it('skips verified nodes', () => {
    const graph = makeGraph([
      { status: 'verified' },
      { status: 'code_generated' },
      { status: 'image_ready' },
    ]);

    const batch = buildDispatchBatch(graph);
    expect(batch).toHaveLength(0);
  });

  it('returns empty array for graph with all verified nodes', () => {
    const graph = makeGraph([
      { status: 'verified' },
      { status: 'verified' },
      { status: 'verified' },
    ]);

    const batch = buildDispatchBatch(graph);
    expect(batch).toEqual([]);
  });

  it('every dispatch spec uses identical system prompt (Invariant 9)', () => {
    const graph = makeGraph([
      { status: 'pending' },
      { status: 'pending' },
      { status: 'caption_verified' },
    ]);

    const batch = buildDispatchBatch(graph);
    expect(batch.length).toBe(3);

    for (const spec of batch) {
      expect(spec.systemPrompt).toBe(CODEGEN_SYSTEM_PROMPT);
    }

    // All identical to each other
    const prompts = new Set(batch.map((s) => s.systemPrompt));
    expect(prompts.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// validateGeneratedCode
// ---------------------------------------------------------------------------

describe('validateGeneratedCode', () => {
  const validCode = [
    'export function createNode(config) {',
    '  const c = new Container();',
    '  return c;',
    '}',
  ].join('\n');

  it('passes valid PixiJS code', () => {
    const result = validateGeneratedCode(validCode);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('fails for empty code', () => {
    const result = validateGeneratedCode('');
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('fails for whitespace-only code', () => {
    const result = validateGeneratedCode('   \n  \t  ');
    expect(result.valid).toBe(false);
  });

  it('detects missing createNode export', () => {
    const code = 'function render() { const c = new Container(); return c; }';
    const result = validateGeneratedCode(code);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes('createNode'))).toBe(true);
  });

  it('detects missing Container usage', () => {
    const code = 'export function createNode(config) { return {}; }';
    const result = validateGeneratedCode(code);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes('Container'))).toBe(true);
  });

  it('detects DOM manipulation — document.createElement', () => {
    const code = [
      'export function createNode(config) {',
      '  const el = document.createElement("div");',
      '  const c = new Container();',
      '  return c;',
      '}',
    ].join('\n');
    const result = validateGeneratedCode(code);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes('DOM'))).toBe(true);
  });

  it('detects innerHTML', () => {
    const code = [
      'export function createNode(config) {',
      '  const c = new Container();',
      '  c.innerHTML = "<span>hi</span>";',
      '  return c;',
      '}',
    ].join('\n');
    const result = validateGeneratedCode(code);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes('DOM'))).toBe(true);
  });

  it('detects async/await', () => {
    const code = [
      'export async function createNode(config) {',
      '  const data = await fetch("/api");',
      '  const c = new Container();',
      '  return c;',
      '}',
    ].join('\n');
    const result = validateGeneratedCode(code);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.toLowerCase().includes('async'))).toBe(
      true,
    );
  });

  it('detects import statements', () => {
    const code = [
      'import { Container } from "pixi.js";',
      'export function createNode(config) {',
      '  const c = new Container();',
      '  return c;',
      '}',
    ].join('\n');
    const result = validateGeneratedCode(code);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes('Import'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// extractCodeFromResponse
// ---------------------------------------------------------------------------

describe('extractCodeFromResponse', () => {
  it('strips markdown fences with language tag', () => {
    const response = '```javascript\nconst x = 1;\n```';
    const code = extractCodeFromResponse(response);
    expect(code).toBe('const x = 1;');
  });

  it('strips markdown fences without language tag', () => {
    const response = '```\nconst x = 1;\n```';
    const code = extractCodeFromResponse(response);
    expect(code).toBe('const x = 1;');
  });

  it('returns raw code when no fences', () => {
    const response = 'const x = 1;';
    const code = extractCodeFromResponse(response);
    expect(code).toBe('const x = 1;');
  });

  it('handles empty string', () => {
    const code = extractCodeFromResponse('');
    expect(code).toBe('');
  });

  it('trims whitespace from raw code', () => {
    const response = '  \n const x = 1; \n  ';
    const code = extractCodeFromResponse(response);
    expect(code).toBe('const x = 1;');
  });

  it('preserves internal newlines in fenced code', () => {
    const response = '```javascript\nline1\nline2\nline3\n```';
    const code = extractCodeFromResponse(response);
    expect(code).toContain('line1');
    expect(code).toContain('line2');
    expect(code).toContain('line3');
  });
});
