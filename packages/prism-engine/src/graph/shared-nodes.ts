/**
 * shared-nodes.ts -- Handles reparent-on-navigate logic for shared components.
 *
 * Spec reference: docs/DIFFUSION-ENGINE-SPEC.md Section 13 -- PixiJS Assembly
 * Invariant 8: Bipartite DAG, Not Hub-and-Spoke
 *
 * Shared components (navbar, footer, etc.) exist once canonically in the graph
 * with per-page property overrides. When the user navigates between hubs, the
 * PixiJS runtime must reparent these shared display objects from the old hub's
 * container to the new hub's container.
 *
 * This module computes the reparent diff: which shared nodes to remove, add,
 * or keep when transitioning between hubs.
 */

import type { PrismGraph, GraphNode } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of computing which shared nodes need reparenting during
 * a hub transition.
 */
export interface ReparentResult {
  /** Node ids to remove from the display tree (no longer visible). */
  remove: string[];
  /** Node ids to add to the display tree (newly visible). */
  add: string[];
  /** Node ids that persist across both hubs (shared between both). */
  persist: string[];
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Determine which shared nodes need to be reparented when navigating
 * from one hub to another.
 *
 * A shared node is one whose hubMemberships includes more than one hub.
 * During navigation:
 * - Nodes shared by both hubs PERSIST (they stay visible, just reparented
 *   to the new hub's container in PixiJS)
 * - Nodes in the old hub but NOT the new hub are REMOVED
 * - Nodes in the new hub but NOT the old hub are ADDED
 *
 * This computation considers ALL nodes in each hub (not just those
 * explicitly marked as shared), because any node visible in the old
 * hub that is also visible in the new hub should persist rather than
 * being destroyed and recreated.
 */
export function reparentSharedNodes(
  graph: PrismGraph,
  fromHubId: string,
  toHubId: string,
): ReparentResult {
  const fromHub = graph.hubs.find((h) => h.id === fromHubId);
  const toHub = graph.hubs.find((h) => h.id === toHubId);

  if (!fromHub && !toHub) {
    return { remove: [], add: [], persist: [] };
  }

  // Build sets of all node ids visible in each hub
  const fromNodeIds = new Set<string>();
  const toNodeIds = new Set<string>();

  if (fromHub) {
    for (const id of fromHub.nodeIds) {
      fromNodeIds.add(id);
    }
    // Also check node hubMemberships for defensive coverage
    for (const node of graph.nodes) {
      if (node.hubMemberships.includes(fromHubId)) {
        fromNodeIds.add(node.id);
      }
    }
  }

  if (toHub) {
    for (const id of toHub.nodeIds) {
      toNodeIds.add(id);
    }
    for (const node of graph.nodes) {
      if (node.hubMemberships.includes(toHubId)) {
        toNodeIds.add(node.id);
      }
    }
  }

  const remove: string[] = [];
  const add: string[] = [];
  const persist: string[] = [];

  // Nodes in fromHub but not in toHub: remove
  for (const id of fromNodeIds) {
    if (!toNodeIds.has(id)) {
      remove.push(id);
    }
  }

  // Nodes in toHub but not in fromHub: add
  for (const id of toNodeIds) {
    if (!fromNodeIds.has(id)) {
      add.push(id);
    }
  }

  // Nodes in both hubs: persist (reparent in PixiJS)
  for (const id of fromNodeIds) {
    if (toNodeIds.has(id)) {
      persist.push(id);
    }
  }

  return { remove, add, persist };
}

/**
 * Return all nodes in the graph that appear in more than one hub.
 *
 * A node is considered shared if its hubMemberships array has length > 1.
 */
export function getSharedNodes(graph: PrismGraph): GraphNode[] {
  return graph.nodes.filter((node) => node.hubMemberships.length > 1);
}

/**
 * Check if a specific node is shared (appears in more than one hub).
 */
export function isSharedNode(graph: PrismGraph, nodeId: string): boolean {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) {
    return false;
  }
  return node.hubMemberships.length > 1;
}
