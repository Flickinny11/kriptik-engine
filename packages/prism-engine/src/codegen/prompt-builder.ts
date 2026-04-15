/**
 * prompt-builder.ts — Builds SGLang system prompt and per-node user messages.
 *
 * Mirrors the prompt construction logic from modal/prism/codegen_worker.py.
 * The actual SGLang inference runs in Python on GPU; these TypeScript modules
 * handle prompt construction, spec building, and dispatch orchestration on
 * the server side.
 *
 * INVARIANT 9: The system prompt is IDENTICAL for ALL SGLang containers.
 * All per-node content goes in the user message ONLY. This enables
 * RadixAttention prefix cache sharing for up to 6.4x throughput gain.
 *
 * Spec reference: docs/DIFFUSION-ENGINE-SPEC.md Section 11
 */

import type {
  GraphNode,
  PrismGraph,
  NodeVisualSpec,
  NodeBehaviorSpec,
  AtlasRegion,
} from '../types.js';

// ---------------------------------------------------------------------------
// NodeSpec — the structured per-node specification sent to code generation
// ---------------------------------------------------------------------------

/**
 * A structured specification for a single graph node, extracted from the
 * knowledge graph. This is the input to user message construction and
 * ultimately to the SGLang code generation model.
 */
export interface NodeSpec {
  nodeId: string;
  caption: string;
  visualSpec: NodeVisualSpec;
  behaviorSpec: NodeBehaviorSpec;
  neighborContext: string;
  atlasRegion: AtlasRegion | null;
}

// ---------------------------------------------------------------------------
// System prompt — IDENTICAL for every node, every container.
// DO NOT add per-node content here. This enables RadixAttention cache sharing.
//
// This constant is defined at module level and never mutated. Every dispatch
// spec and every container in the fleet sends this exact string as the system
// message. SGLang's RadixAttention caches the KV entries for this prefix, so
// all 100+ containers share a single cached computation.
// ---------------------------------------------------------------------------

export const CODEGEN_SYSTEM_PROMPT = `You are a code generator for Kriptik Prism. Generate a self-contained PixiJS v8
component module for a UI element.

CONSTRAINTS:
- Use PixiJS v8 API only (Container, Sprite, Graphics, Text, NineSliceSprite)
- Export a single function: createNode(config: NodeConfig): Container
- Handle all events internally (pointerover, pointerout, pointertap)
- Use GSAP for animations
- All text uses BitmapText or programmatic rendering (no DOM text)
- Code must be synchronous (no async/await in render path)
- Return a PixiJS Container with all children attached

OUTPUT: Only the JavaScript code. No explanation. No markdown fences.`;

// ---------------------------------------------------------------------------
// Neighbor context construction
// ---------------------------------------------------------------------------

/**
 * Build a terse neighbor context string for a node.
 *
 * Examines graph edges to find parent, sibling, and child relationships.
 * Returns a human-readable summary like:
 *
 *     Parent: node-abc (element, navbar)
 *     Siblings: node-def (element, button), node-ghi (element, input)
 *     Children: node-jkl (element, icon)
 *
 * Only includes type and elementType -- never code, captions, or full specs
 * of neighbors (those are self-contained in each node's own caption per
 * Invariant 2).
 */
export function buildNeighborContext(nodeId: string, graph: PrismGraph): string {
  const nodesById = new Map<string, GraphNode>();
  for (const n of graph.nodes) {
    nodesById.set(n.id, n);
  }

  const parentIds: string[] = [];
  const childIds: string[] = [];
  const parentIdSet = new Set<string>();

  for (const edge of graph.edges) {
    if (edge.type === 'contains') {
      if (edge.target === nodeId) {
        parentIds.push(edge.source);
        parentIdSet.add(edge.source);
      } else if (edge.source === nodeId) {
        childIds.push(edge.target);
      }
    }
  }

  // Siblings: other nodes that share a parent via 'contains' edges
  const siblingIdSet = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.type === 'contains' && parentIdSet.has(edge.source)) {
      if (edge.target && edge.target !== nodeId) {
        siblingIdSet.add(edge.target);
      }
    }
  }

  function describe(nid: string): string {
    const n = nodesById.get(nid);
    if (!n) {
      return `${nid} (unknown)`;
    }
    if (n.elementType) {
      return `${nid} (${n.type}, ${n.elementType})`;
    }
    return `${nid} (${n.type})`;
  }

  const lines: string[] = [];

  if (parentIds.length > 0) {
    const parentDescs = parentIds.map(describe).join(', ');
    lines.push(`Parent: ${parentDescs}`);
  } else {
    lines.push('Parent: none (root-level element)');
  }

  if (siblingIdSet.size > 0) {
    const siblingList = Array.from(siblingIdSet).sort().slice(0, 10);
    let siblingDescs = siblingList.map(describe).join(', ');
    if (siblingIdSet.size > 10) {
      siblingDescs += `, ... (+${siblingIdSet.size - 10} more)`;
    }
    lines.push(`Siblings: ${siblingDescs}`);
  } else {
    lines.push('Siblings: none');
  }

  if (childIds.length > 0) {
    const childList = childIds.slice(0, 10);
    let childDescs = childList.map(describe).join(', ');
    if (childIds.length > 10) {
      childDescs += `, ... (+${childIds.length - 10} more)`;
    }
    lines.push(`Children: ${childDescs}`);
  } else {
    lines.push('Children: none');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Node spec extraction
// ---------------------------------------------------------------------------

/**
 * Extract a NodeSpec from a GraphNode and its PrismGraph context.
 *
 * Pulls caption, visualSpec, behaviorSpec, and atlasRegion directly from
 * the node. Builds neighbor context from graph edges (terse: just type
 * and elementType of adjacent nodes).
 */
export function buildNodeSpec(node: GraphNode, graph: PrismGraph): NodeSpec {
  return {
    nodeId: node.id,
    caption: node.caption,
    visualSpec: node.visualSpec,
    behaviorSpec: node.behaviorSpec,
    neighborContext: buildNeighborContext(node.id, graph),
    atlasRegion: node.atlasRegion,
  };
}

// ---------------------------------------------------------------------------
// User message construction
// ---------------------------------------------------------------------------

/**
 * Build the per-node user message for SGLang code generation.
 *
 * This is the content that varies across containers. It is sent as the
 * user message while the system message (CODEGEN_SYSTEM_PROMPT) remains
 * identical for all nodes.
 *
 * Format:
 *   ELEMENT SPECIFICATION:
 *   {caption}
 *
 *   VISUAL:
 *   {visualSpec details}
 *
 *   BEHAVIOR:
 *   {behaviorSpec details}
 *
 *   NEIGHBORS:
 *   {neighborContext}
 *
 *   ATLAS REGION:
 *   {atlasRegion}
 */
export function buildUserMessage(spec: NodeSpec): string {
  const visualStr = formatVisualSpec(spec.visualSpec);
  const behaviorStr = formatBehaviorSpec(spec.behaviorSpec);
  const atlasStr = formatAtlasRegion(spec.atlasRegion);

  return (
    `ELEMENT SPECIFICATION:\n${spec.caption}\n\n` +
    `VISUAL:\n${visualStr}\n\n` +
    `BEHAVIOR:\n${behaviorStr}\n\n` +
    `NEIGHBORS:\n${spec.neighborContext}\n\n` +
    `ATLAS REGION:\n${atlasStr}`
  );
}

// ---------------------------------------------------------------------------
// Internal formatting helpers
// ---------------------------------------------------------------------------

function formatVisualSpec(visualSpec: NodeVisualSpec): string {
  const parts: string[] = [];

  if (visualSpec.colors) {
    parts.push(`Colors: ${JSON.stringify(visualSpec.colors)}`);
  }
  if (visualSpec.typography) {
    parts.push(`Typography: ${JSON.stringify(visualSpec.typography)}`);
  }
  if (visualSpec.effects) {
    parts.push(`Effects: ${JSON.stringify(visualSpec.effects)}`);
  }
  if (visualSpec.spacing) {
    parts.push(`Spacing: ${JSON.stringify(visualSpec.spacing)}`);
  }
  if (visualSpec.borders) {
    parts.push(`Borders: ${JSON.stringify(visualSpec.borders)}`);
  }
  if (visualSpec.animation) {
    parts.push(`Animation: ${JSON.stringify(visualSpec.animation)}`);
  }
  if (visualSpec.textContent && visualSpec.textContent.length > 0) {
    parts.push(`Text content: ${JSON.stringify(visualSpec.textContent)}`);
  }

  if (parts.length === 0) {
    return 'none';
  }
  return parts.map((p) => `- ${p}`).join('\n');
}

function formatBehaviorSpec(behaviorSpec: NodeBehaviorSpec): string {
  const parts: string[] = [];

  if (behaviorSpec.interactions && behaviorSpec.interactions.length > 0) {
    parts.push(`Interactions: ${JSON.stringify(behaviorSpec.interactions)}`);
  }
  if (behaviorSpec.dataBindings && behaviorSpec.dataBindings.length > 0) {
    parts.push(`Data bindings: ${JSON.stringify(behaviorSpec.dataBindings)}`);
  }
  if (behaviorSpec.stateManagement) {
    parts.push(`State: ${JSON.stringify(behaviorSpec.stateManagement)}`);
  }
  if (behaviorSpec.apiCalls && behaviorSpec.apiCalls.length > 0) {
    parts.push(`API calls: ${JSON.stringify(behaviorSpec.apiCalls)}`);
  }
  if (behaviorSpec.accessibilityRole) {
    parts.push(`Accessibility role: ${behaviorSpec.accessibilityRole}`);
  }

  if (parts.length === 0) {
    return 'none';
  }
  return parts.map((p) => `- ${p}`).join('\n');
}

function formatAtlasRegion(atlasRegion: AtlasRegion | null): string {
  if (!atlasRegion) {
    return 'none (no atlas region assigned)';
  }
  return (
    `Atlas: ${atlasRegion.atlasIndex}, ` +
    `Source rect: ${atlasRegion.x}, ${atlasRegion.y}, ` +
    `${atlasRegion.width}, ${atlasRegion.height}`
  );
}
