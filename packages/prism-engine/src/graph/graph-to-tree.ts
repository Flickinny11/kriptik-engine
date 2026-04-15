/**
 * graph-to-tree.ts -- Converts the bipartite DAG (PrismGraph) to a
 * PixiJS-compatible tree for rendering.
 *
 * Spec reference: docs/DIFFUSION-ENGINE-SPEC.md Section 13 -- PixiJS Assembly
 *
 * PixiJS requires a single-parent display tree, but the Prism graph is a
 * bipartite DAG where shared nodes belong to multiple hubs. This module
 * provides the conversion logic: given an active hub, produce a tree
 * rooted at that hub with all its nodes (including shared nodes) as children.
 *
 * The graph-to-tree adapter in the runtime uses this logic to build
 * PixiJS Container hierarchies and reparent shared nodes on navigate.
 */

import type { PrismGraph, GraphNode, GraphEdge } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A node in the PixiJS-compatible render tree.
 *
 * Each TreeNode maps to a PixiJS Container. The children array forms
 * the single-parent hierarchy required by PixiJS.
 */
export interface TreeNode {
  nodeId: string;
  children: TreeNode[];
  isShared: boolean;
  position: {
    x: number;
    y: number;
    z: number;
    width: number;
    height: number;
  };
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Convert a PrismGraph to a PixiJS-compatible tree rooted at the active hub.
 *
 * The tree structure:
 * - Root node represents the hub container (isRenderGroup = true in PixiJS v8)
 * - Direct children are element nodes belonging to this hub
 * - Shared nodes are included under the active hub (reparent-on-navigate)
 * - Containment edges (type: 'contains') determine parent-child nesting
 *   within the hub; elements without a containment parent sit directly
 *   under the hub root
 *
 * Z-ordering is determined by the node's position.z value.
 */
export function graphToTree(graph: PrismGraph, activeHubId: string): TreeNode {
  const hub = graph.hubs.find((h) => h.id === activeHubId);
  if (!hub) {
    // Return an empty root for an unknown hub
    return {
      nodeId: activeHubId,
      children: [],
      isShared: false,
      position: { x: 0, y: 0, z: 0, width: 0, height: 0 },
    };
  }

  // Gather all nodes visible in this hub
  const activeNodes = getActiveNodes(graph, activeHubId);
  const activeNodeIds = new Set(activeNodes.map((n) => n.id));

  // Build a lookup for quick access
  const nodeMap = new Map<string, GraphNode>();
  for (const node of activeNodes) {
    nodeMap.set(node.id, node);
  }

  // Build containment hierarchy from 'contains' edges within this hub
  const containsEdges = graph.edges.filter(
    (e) =>
      e.type === 'contains' &&
      activeNodeIds.has(e.source) &&
      activeNodeIds.has(e.target),
  );

  // Map from child nodeId to parent nodeId
  const parentMap = new Map<string, string>();
  for (const edge of containsEdges) {
    parentMap.set(edge.target, edge.source);
  }

  // Map from parent nodeId to list of child nodeIds
  const childrenMap = new Map<string, string[]>();
  for (const edge of containsEdges) {
    if (!childrenMap.has(edge.source)) {
      childrenMap.set(edge.source, []);
    }
    childrenMap.get(edge.source)!.push(edge.target);
  }

  // Set of shared node ids in this hub
  const sharedNodeIds = new Set(hub.sharedNodeIds);

  // Recursively build tree nodes
  function buildTreeNode(nodeId: string): TreeNode {
    const graphNode = nodeMap.get(nodeId);
    const childIds = childrenMap.get(nodeId) ?? [];

    // Sort children by z-index for consistent ordering
    const sortedChildIds = [...childIds].sort((a, b) => {
      const aNode = nodeMap.get(a);
      const bNode = nodeMap.get(b);
      return (aNode?.position.z ?? 0) - (bNode?.position.z ?? 0);
    });

    return {
      nodeId,
      children: sortedChildIds.map(buildTreeNode),
      isShared: sharedNodeIds.has(nodeId),
      position: graphNode
        ? { ...graphNode.position }
        : { x: 0, y: 0, z: 0, width: 0, height: 0 },
    };
  }

  // Find top-level nodes: those that have no containment parent within this hub
  const topLevelNodeIds = activeNodes
    .filter((n) => !parentMap.has(n.id))
    .sort((a, b) => (a.position.z ?? 0) - (b.position.z ?? 0))
    .map((n) => n.id);

  // Build the hub root
  const root: TreeNode = {
    nodeId: activeHubId,
    children: topLevelNodeIds.map(buildTreeNode),
    isShared: false,
    position: { x: 0, y: 0, z: 0, width: 0, height: 0 },
  };

  return root;
}

/**
 * Return all nodes visible in a given hub: both the hub's own nodes
 * and shared nodes that belong to this hub.
 *
 * Uses hub.nodeIds (which already includes shared nodes added during
 * graph construction) and falls back to checking node.hubMemberships
 * for any nodes that might not be in the hub's list.
 */
export function getActiveNodes(graph: PrismGraph, hubId: string): GraphNode[] {
  const hub = graph.hubs.find((h) => h.id === hubId);
  if (!hub) {
    return [];
  }

  // Start with the ids listed in the hub
  const nodeIdSet = new Set(hub.nodeIds);

  // Also include any nodes whose hubMemberships include this hub
  // (defensive: handles cases where graph construction added memberships
  // but the hub's nodeIds list wasn't updated)
  for (const node of graph.nodes) {
    if (node.hubMemberships.includes(hubId)) {
      nodeIdSet.add(node.id);
    }
  }

  // Resolve ids to actual GraphNode objects
  const result: GraphNode[] = [];
  for (const node of graph.nodes) {
    if (nodeIdSet.has(node.id)) {
      result.push(node);
    }
  }

  return result;
}
