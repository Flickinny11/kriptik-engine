/**
 * Dependency graph — DAG of goals with topological ordering and frontier calculation.
 *
 * The dependency graph is the core scheduling structure. Goals are nodes,
 * dependencies are directed edges. The frontier is the continuously evolving
 * set of goals with all dependencies in "merged" status.
 *
 * There are NO "waves" — the frontier expands as goals merge, and new
 * agents launch immediately for newly eligible goals.
 *
 * Spec Section 4.1 — "The Cortex analyzes the full goal set and builds
 * a dependency graph... From this graph, the Cortex launches everything
 * with zero unmet dependencies simultaneously."
 */

import type {
  IDependencyGraph,
  IGoalAssignment,
  GoalStatus,
} from "@kriptik/shared-interfaces";

/** Internal representation of a goal node in the DAG. */
interface GoalNode {
  readonly id: string;
  readonly goal: IGoalAssignment;
  status: GoalStatus;
  /** IDs of goals this goal depends on (incoming edges). */
  readonly dependencies: Set<string>;
  /** IDs of goals that depend on this goal (outgoing edges). */
  readonly dependents: Set<string>;
}

/**
 * Concrete dependency graph implementation.
 *
 * Uses Kahn's algorithm for topological sort and cycle detection.
 * Frontier is computed by finding goals in "blocked" or "eligible" status
 * whose dependencies are all in "merged" status.
 */
export class DependencyGraph implements IDependencyGraph {
  private readonly _nodes = new Map<string, GoalNode>();

  addGoal(goal: IGoalAssignment): void {
    if (this._nodes.has(goal.id)) {
      throw new Error(`Goal ${goal.id} already exists in the graph`);
    }

    const node: GoalNode = {
      id: goal.id,
      goal,
      status: goal.dependsOn.length === 0 ? "eligible" : "blocked",
      dependencies: new Set(goal.dependsOn),
      dependents: new Set(),
    };

    this._nodes.set(goal.id, node);

    // Register this goal as a dependent of each of its dependencies
    for (const depId of goal.dependsOn) {
      const depNode = this._nodes.get(depId);
      if (depNode) {
        depNode.dependents.add(goal.id);
      }
      // If the dependency hasn't been added yet, the reverse link
      // will be established when that goal is added
    }

    // Check if any previously added goals depend on this one
    for (const [, existingNode] of this._nodes) {
      if (existingNode.dependencies.has(goal.id)) {
        node.dependents.add(existingNode.id);
      }
    }
  }

  getFrontier(): readonly string[] {
    const frontier: string[] = [];

    for (const [id, node] of this._nodes) {
      // A goal is on the frontier if:
      // 1. It's not already assigned, submitted, merged, or failed
      // 2. All its dependencies are in "merged" status
      if (node.status !== "blocked" && node.status !== "eligible") {
        continue;
      }

      const allDepsMerged = this._allDependenciesMerged(id);
      if (allDepsMerged) {
        frontier.push(id);
      }
    }

    return frontier;
  }

  updateGoalStatus(goalId: string, status: GoalStatus): void {
    const node = this._nodes.get(goalId);
    if (!node) {
      throw new Error(`Goal ${goalId} not found in the graph`);
    }
    node.status = status;

    // When a goal merges, check if any dependents become eligible
    if (status === "merged") {
      for (const depId of node.dependents) {
        const dependent = this._nodes.get(depId);
        if (dependent && dependent.status === "blocked") {
          if (this._allDependenciesMerged(depId)) {
            dependent.status = "eligible";
          }
        }
      }
    }
  }

  getTopologicalOrder(): readonly string[] {
    // Kahn's algorithm
    const inDegree = new Map<string, number>();
    const queue: string[] = [];
    const result: string[] = [];

    // Initialize in-degrees
    for (const [id, node] of this._nodes) {
      const degree = [...node.dependencies].filter((d) =>
        this._nodes.has(d),
      ).length;
      inDegree.set(id, degree);
      if (degree === 0) {
        queue.push(id);
      }
    }

    while (queue.length > 0) {
      const id = queue.shift()!;
      result.push(id);

      const node = this._nodes.get(id)!;
      for (const depId of node.dependents) {
        const currentDegree = inDegree.get(depId)!;
        const newDegree = currentDegree - 1;
        inDegree.set(depId, newDegree);
        if (newDegree === 0) {
          queue.push(depId);
        }
      }
    }

    return result;
  }

  getDependents(goalId: string): readonly string[] {
    const node = this._nodes.get(goalId);
    if (!node) {
      throw new Error(`Goal ${goalId} not found in the graph`);
    }
    return [...node.dependents];
  }

  getDependencies(goalId: string): readonly string[] {
    const node = this._nodes.get(goalId);
    if (!node) {
      throw new Error(`Goal ${goalId} not found in the graph`);
    }
    return [...node.dependencies];
  }

  getAllGoalIds(): readonly string[] {
    return [...this._nodes.keys()];
  }

  getGoalStatus(goalId: string): GoalStatus {
    const node = this._nodes.get(goalId);
    if (!node) {
      throw new Error(`Goal ${goalId} not found in the graph`);
    }
    return node.status;
  }

  detectCycle(): readonly string[] | null {
    const topoOrder = this.getTopologicalOrder();
    if (topoOrder.length === this._nodes.size) {
      return null; // No cycle — all nodes visited
    }

    // Find nodes not in the topological order — they form cycles
    const visited = new Set(topoOrder);
    const cycleNodes: string[] = [];
    for (const id of this._nodes.keys()) {
      if (!visited.has(id)) {
        cycleNodes.push(id);
      }
    }

    return cycleNodes;
  }

  getCriticalPath(): readonly string[] {
    const topoOrder = this.getTopologicalOrder();
    if (topoOrder.length === 0) return [];

    // Longest path in DAG via dynamic programming
    const dist = new Map<string, number>();
    const predecessor = new Map<string, string | null>();

    for (const id of topoOrder) {
      dist.set(id, 0);
      predecessor.set(id, null);
    }

    for (const id of topoOrder) {
      const node = this._nodes.get(id)!;
      const currentDist = dist.get(id)!;

      for (const depId of node.dependents) {
        if (!this._nodes.has(depId)) continue;
        const depDist = dist.get(depId)!;
        if (currentDist + 1 > depDist) {
          dist.set(depId, currentDist + 1);
          predecessor.set(depId, id);
        }
      }
    }

    // Find the node with the largest distance
    let maxDist = 0;
    let endNode = topoOrder[0];
    for (const [id, d] of dist) {
      if (d > maxDist) {
        maxDist = d;
        endNode = id;
      }
    }

    // Trace back the path
    const path: string[] = [];
    let current: string | null = endNode;
    while (current !== null) {
      path.unshift(current);
      current = predecessor.get(current) ?? null;
    }

    return path;
  }

  /** Get the full goal assignment for a goal ID. */
  getGoal(goalId: string): IGoalAssignment | undefined {
    return this._nodes.get(goalId)?.goal;
  }

  /** Check whether all dependencies of a goal are merged. */
  private _allDependenciesMerged(goalId: string): boolean {
    const node = this._nodes.get(goalId);
    if (!node) return false;

    for (const depId of node.dependencies) {
      const depNode = this._nodes.get(depId);
      if (!depNode || depNode.status !== "merged") {
        return false;
      }
    }
    return true;
  }
}
