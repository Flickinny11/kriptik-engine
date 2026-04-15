/**
 * graph-construction.ts -- Constructs a PrismGraph from plan data and segmentation results.
 *
 * Spec reference: docs/DIFFUSION-ENGINE-SPEC.md Section 10 -- Knowledge Graph Construction
 *
 * The graph IS the application (Invariant 1). Every node caption is self-contained
 * (Invariant 2). This module builds the initial graph structure from planning output
 * and SAM 3.1 segmentation results.
 */

import type {
  PrismGraph,
  GraphNode,
  GraphEdge,
  Hub,
  HubTransition,
  GraphMetadata,
  NodeVisualSpec,
  NodeBehaviorSpec,
  AtlasRegion,
  PrismGraphPlan,
  HubPlan,
  ElementPlan,
  SharedComponentPlan,
  Interaction,
} from '../types.js';

// ---------------------------------------------------------------------------
// Types exported from this module
// ---------------------------------------------------------------------------

/** Result from SAM 3.1 segmentation of a single element. */
export interface SegmentResult {
  id: string;
  bbox: [x: number, y: number, w: number, h: number];
  label: string;
  confidence: number;
}

/** A matched pairing of a planned element to a segmentation result. */
export interface SegmentMatch {
  elementId: string;
  segmentId: string;
  score: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic UUID-like id from a prefix and index.
 * Real pipeline uses crypto.randomUUID(); this provides a fallback
 * when the plan elements already carry their own ids.
 */
function ensureId(existing: string | undefined, fallback: string): string {
  return existing && existing.length > 0 ? existing : fallback;
}

/**
 * Build a default NodeVisualSpec for an element plan.
 * The real visual spec is enriched later by image analysis,
 * but the plan carries enough to bootstrap the graph.
 */
function buildDefaultVisualSpec(element: ElementPlan): NodeVisualSpec {
  return {
    description: element.caption,
    colors: { primary: '#000000' },
    typography: {},
    spacing: {},
    borders: {},
    effects: {},
    animation: null,
    textContent: element.textContent ?? [],
  };
}

/**
 * Build a default NodeBehaviorSpec from element interactions.
 */
function buildDefaultBehaviorSpec(element: ElementPlan): NodeBehaviorSpec {
  return {
    interactions: element.interactions ?? [],
    dataBindings: [],
    stateManagement: null,
    apiCalls: [],
    accessibilityRole: element.type === 'button' ? 'button' : 'group',
    tabIndex: 0,
  };
}

/**
 * Compute IoU (Intersection over Union) of two bounding boxes.
 * Bounding boxes are [x, y, width, height].
 */
function computeIoU(
  a: [number, number, number, number],
  b: [number, number, number, number],
): number {
  const ax1 = a[0];
  const ay1 = a[1];
  const ax2 = a[0] + a[2];
  const ay2 = a[1] + a[3];

  const bx1 = b[0];
  const by1 = b[1];
  const bx2 = b[0] + b[2];
  const by2 = b[1] + b[3];

  const ix1 = Math.max(ax1, bx1);
  const iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);

  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const intersection = iw * ih;

  if (intersection === 0) return 0;

  const areaA = a[2] * a[3];
  const areaB = b[2] * b[3];
  const union = areaA + areaB - intersection;

  return union > 0 ? intersection / union : 0;
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Construct a PrismGraph from a graph plan.
 *
 * Creates Hub objects, GraphNode objects for each element, edges from
 * interactions and navigation, and computes metadata. Shared components
 * are added to multiple hubs' sharedNodeIds.
 */
export function constructGraph(
  plan: PrismGraphPlan,
  projectId: string,
  planId: string,
): PrismGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const hubs: Hub[] = [];

  // Track which node ids belong to which hubs, and which are shared
  const nodeHubMap = new Map<string, Set<string>>();

  // Collect shared component ids for cross-referencing
  const sharedComponentIds = new Set<string>();
  const sharedComponentHubMap = new Map<string, string[]>();

  for (const sc of plan.sharedComponents) {
    sharedComponentIds.add(sc.id);
    sharedComponentHubMap.set(sc.id, sc.hubIds);
  }

  // --- Step 1: Create nodes from hub elements ---
  let edgeIndex = 0;

  for (const hubPlan of plan.hubs) {
    const hubNodeIds: string[] = [];
    const hubSharedNodeIds: string[] = [];

    for (const element of hubPlan.elements) {
      const nodeId = ensureId(element.id, `node-${hubPlan.id}-${element.id}`);

      // Determine hub memberships: if element is shared, it appears in multiple hubs
      let hubMemberships: string[];
      if (element.isShared && sharedComponentHubMap.has(nodeId)) {
        hubMemberships = sharedComponentHubMap.get(nodeId)!;
      } else if (element.isShared) {
        // Shared but not in the explicit shared components list;
        // at minimum it belongs to this hub
        hubMemberships = [hubPlan.id];
      } else {
        hubMemberships = [hubPlan.id];
      }

      // Track hub membership
      if (!nodeHubMap.has(nodeId)) {
        nodeHubMap.set(nodeId, new Set<string>());
      }
      nodeHubMap.get(nodeId)!.add(hubPlan.id);

      // Only create the node once (shared elements may appear in multiple hub plans)
      const alreadyCreated = nodes.some((n) => n.id === nodeId);
      if (!alreadyCreated) {
        const graphNode: GraphNode = {
          id: nodeId,
          type: 'element',
          elementType: element.type,
          caption: element.caption,
          captionVerified: false,
          hubMemberships,
          position: {
            x: element.position.x,
            y: element.position.y,
            z: 0,
            width: element.position.width,
            height: element.position.height,
          },
          visualSpec: buildDefaultVisualSpec(element),
          behaviorSpec: buildDefaultBehaviorSpec(element),
          code: null,
          codeHash: null,
          verificationScore: null,
          imageUrl: null,
          atlasRegion: null,
          dependencies: [],
          status: 'pending',
        };
        nodes.push(graphNode);
      } else {
        // Update hub memberships on the existing node
        const existingNode = nodes.find((n) => n.id === nodeId)!;
        if (!existingNode.hubMemberships.includes(hubPlan.id)) {
          existingNode.hubMemberships.push(hubPlan.id);
        }
      }

      hubNodeIds.push(nodeId);

      if (element.isShared) {
        hubSharedNodeIds.push(nodeId);
      }

      // Create edges from element interactions
      for (const interaction of element.interactions ?? []) {
        if (interaction.targetNodeId) {
          edges.push({
            id: `edge-${edgeIndex++}`,
            source: nodeId,
            target: interaction.targetNodeId,
            type: interactionToEdgeType(interaction),
            metadata: {
              event: interaction.event,
              action: interaction.action,
            },
          });
        }
        if (interaction.targetHubId) {
          // Navigation edges are hub-level; we record them but they point
          // to a hub id, not a node id. We represent them as edges where
          // the target is the hub id (convention: hub edges have type 'navigates-to').
          edges.push({
            id: `edge-${edgeIndex++}`,
            source: nodeId,
            target: interaction.targetHubId,
            type: 'navigates-to',
            metadata: {
              event: interaction.event,
              action: interaction.action,
              targetHubId: interaction.targetHubId,
            },
          });
        }
      }
    }

    // --- Step 2: Build hub transitions from navigation graph ---
    const transitions: HubTransition[] = [];
    for (const navEdge of plan.navigationGraph) {
      if (navEdge.sourceHubId === hubPlan.id) {
        transitions.push({
          targetHubId: navEdge.targetHubId,
          trigger: 'navigation',
          animation: 'fade',
        });
      }
    }

    const hub: Hub = {
      id: hubPlan.id,
      name: hubPlan.name,
      route: hubPlan.route,
      layoutTemplate: normalizeLayoutTemplate(hubPlan.layoutTemplate),
      nodeIds: hubNodeIds,
      sharedNodeIds: hubSharedNodeIds,
      authRequired: hubPlan.authRequired,
      transitions,
      metadata: {
        description: hubPlan.description,
      },
    };
    hubs.push(hub);
  }

  // --- Step 3: Add shared components that were not included in hub element lists ---
  for (const sc of plan.sharedComponents) {
    const alreadyCreated = nodes.some((n) => n.id === sc.id);
    if (!alreadyCreated) {
      const graphNode: GraphNode = {
        id: sc.id,
        type: 'element',
        elementType: sc.type,
        caption: sc.caption,
        captionVerified: false,
        hubMemberships: sc.hubIds,
        position: { x: 0, y: 0, z: 0, width: 0, height: 0 },
        visualSpec: {
          description: sc.caption,
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
          accessibilityRole: 'group',
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
      nodes.push(graphNode);
    }

    // Ensure all target hubs list this shared component
    for (const hubId of sc.hubIds) {
      const hub = hubs.find((h) => h.id === hubId);
      if (hub) {
        if (!hub.nodeIds.includes(sc.id)) {
          hub.nodeIds.push(sc.id);
        }
        if (!hub.sharedNodeIds.includes(sc.id)) {
          hub.sharedNodeIds.push(sc.id);
        }
      }
    }
  }

  // --- Step 4: Finalize hub memberships from the nodeHubMap ---
  for (const node of nodes) {
    const hubSet = nodeHubMap.get(node.id);
    if (hubSet) {
      for (const hubId of hubSet) {
        if (!node.hubMemberships.includes(hubId)) {
          node.hubMemberships.push(hubId);
        }
      }
    }
  }

  // --- Step 5: Add edges from navigation graph ---
  for (const navEdge of plan.navigationGraph) {
    // Check we haven't already created a duplicate
    const exists = edges.some(
      (e) =>
        e.type === 'navigates-to' &&
        e.metadata?.targetHubId === navEdge.targetHubId &&
        e.source === navEdge.sourceHubId,
    );
    if (!exists) {
      edges.push({
        id: `edge-${edgeIndex++}`,
        source: navEdge.sourceHubId,
        target: navEdge.targetHubId,
        type: 'navigates-to',
        metadata: {
          trigger: navEdge.trigger,
          conditions: navEdge.conditions ?? {},
        },
      });
    }
  }

  // --- Step 6: Compute metadata ---
  const graphId = `graph-${projectId}-${Date.now()}`;
  const metadata = computeGraphMetadataFromParts(nodes, edges, hubs);

  const graph: PrismGraph = {
    id: graphId,
    planId,
    projectId,
    version: 1,
    nodes,
    edges,
    hubs,
    metadata,
  };

  return graph;
}

/**
 * Match SAM 3.1 segmentation results to planned elements using
 * IoU (Intersection over Union) of bounding boxes.
 *
 * For each segment, finds the best-matching element based on spatial
 * proximity. Returns matches sorted by confidence (descending).
 */
export function matchSegmentsToElements(
  segments: SegmentResult[],
  elements: ElementPlan[],
): SegmentMatch[] {
  const matches: SegmentMatch[] = [];

  for (const segment of segments) {
    let bestScore = 0;
    let bestElementId = '';

    for (const element of elements) {
      const elementBbox: [number, number, number, number] = [
        element.position.x,
        element.position.y,
        element.position.width,
        element.position.height,
      ];
      const iou = computeIoU(segment.bbox, elementBbox);

      if (iou > bestScore) {
        bestScore = iou;
        bestElementId = element.id;
      }
    }

    if (bestElementId && bestScore > 0) {
      matches.push({
        elementId: bestElementId,
        segmentId: segment.id,
        score: bestScore,
      });
    }
  }

  // Sort by score descending (highest confidence first)
  matches.sort((a, b) => b.score - a.score);

  return matches;
}

/**
 * Compute graph metadata from a PrismGraph.
 *
 * Calculates totalNodes, totalEdges, totalHubs, totalSharedNodes,
 * estimatedDrawCalls, atlasCount, totalCodeSize, generationTimeMs,
 * and totalCost.
 */
export function computeGraphMetadata(graph: PrismGraph): GraphMetadata {
  return computeGraphMetadataFromParts(graph.nodes, graph.edges, graph.hubs);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function computeGraphMetadataFromParts(
  nodes: GraphNode[],
  edges: GraphEdge[],
  hubs: Hub[],
): GraphMetadata {
  // Shared nodes are those appearing in more than one hub
  const sharedNodeCount = nodes.filter((n) => n.hubMemberships.length > 1).length;

  // Estimated draw calls: roughly 1 per visible element node, plus atlas draws.
  // In a single hub view, draw calls = hub's node count + atlas count.
  // We approximate with the total node count as an upper bound.
  const maxHubNodes = hubs.reduce((max, h) => Math.max(max, h.nodeIds.length), 0);
  const estimatedDrawCalls = maxHubNodes + 1; // +1 for the atlas texture bind

  // Atlas count is computed later by the atlas packer; default to 0
  const atlasCount = countAtlases(nodes);

  // Total code size: sum of all generated code bytes
  let totalCodeSize = 0;
  for (const node of nodes) {
    if (node.code) {
      totalCodeSize += new TextEncoder().encode(node.code).length;
    }
  }

  return {
    totalNodes: nodes.length,
    totalEdges: edges.length,
    totalHubs: hubs.length,
    totalSharedNodes: sharedNodeCount,
    estimatedDrawCalls,
    atlasCount,
    totalCodeSize,
    generationTimeMs: 0,
    totalCost: 0,
  };
}

function countAtlases(nodes: GraphNode[]): number {
  const indices = new Set<number>();
  for (const node of nodes) {
    if (node.atlasRegion) {
      indices.add(node.atlasRegion.atlasIndex);
    }
  }
  return indices.size;
}

function interactionToEdgeType(
  interaction: Interaction,
): GraphEdge['type'] {
  switch (interaction.action) {
    case 'navigate':
      return 'navigates-to';
    case 'toggle':
    case 'submit':
    case 'open-modal':
    case 'close-modal':
    case 'animation':
    case 'custom':
      return 'triggers';
    case 'api-call':
      return 'data-flow';
    case 'state-update':
      return 'shares-state';
    default:
      return 'triggers';
  }
}

function normalizeLayoutTemplate(
  template: string,
): Hub['layoutTemplate'] {
  const valid: Hub['layoutTemplate'][] = [
    'single-column',
    'two-column',
    'sidebar',
    'dashboard',
    'fullscreen',
  ];
  if (valid.includes(template as Hub['layoutTemplate'])) {
    return template as Hub['layoutTemplate'];
  }
  return 'single-column';
}
