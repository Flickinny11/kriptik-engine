/**
 * Cortex Orchestrator interfaces — dependency graph scheduling,
 * goal assignment, frontier management, and build lifecycle orchestration.
 *
 * The Cortex Orchestrator is the central coordinator that:
 * - Builds a dependency graph from goal assignments
 * - Continuously calculates the frontier of eligible goals
 * - Launches agents via the harness for eligible goals
 * - Creates per-agent branches via the build repository
 * - Processes merge results and advances the frontier
 * - Emits ESAA events for all orchestrator decisions
 *
 * The Cortex does NOT:
 * - Relay messages between agents (graph-mesh is peer-to-peer)
 * - Decompose goals into sub-tasks (agents are autonomous)
 * - Poll agent status on a timer (subscribes to pub/sub events)
 * - Dictate HOW agents implement their goals
 *
 * Spec Section 3.2 — Cortex Orchestrator taxonomy.
 * Spec Section 4.1 — Dependency-Graph-Driven Scheduling.
 * Spec Section 12.4, Phase A Step 3.
 */

import type { IGoalAssignment, GoalStatus, IAgentHarnessConfig, ModelTier } from "./agents.js";
import type { IGraphMeshConfig, IGraphEdge } from "./communication.js";
import type { IMergeGateResult } from "./verification.js";
import type { IESAAEvent, GoalProgress, IMergeRecord } from "./state.js";

// ---------------------------------------------------------------------------
// Dependency graph
// ---------------------------------------------------------------------------

/**
 * IDependencyGraph — the DAG (directed acyclic graph) of goals.
 *
 * There are NO "waves" in Cortex. The dependency graph determines when
 * goals launch — a goal launches when ALL of its dependencies are satisfied.
 * The frontier continuously evolves as goals complete.
 *
 * Spec Section 4.1 — "The Cortex analyzes the full goal set and builds
 * a dependency graph... From this graph, the Cortex launches everything
 * with zero unmet dependencies simultaneously."
 */
export interface IDependencyGraph {
  /**
   * Add a goal to the graph.
   * Dependencies are read from goal.dependsOn.
   */
  addGoal(goal: IGoalAssignment): void;

  /**
   * Get the current frontier — goals with all dependencies in "merged" status,
   * that are not yet assigned or completed.
   *
   * This is the continuously evolving set of eligible work.
   * Spec Section 4.1 — "There's a continuously evolving frontier of eligible goals."
   */
  getFrontier(): readonly string[];

  /**
   * Mark a goal as having reached a new status.
   * When a goal transitions to "merged", this may unblock downstream goals
   * and expand the frontier.
   */
  updateGoalStatus(goalId: string, status: GoalStatus): void;

  /**
   * Get the topological ordering of all goals.
   * Used for build planning and progress reporting.
   */
  getTopologicalOrder(): readonly string[];

  /**
   * Get the IDs of goals that directly depend on the given goal.
   * These are candidates to join the frontier when goalId merges.
   */
  getDependents(goalId: string): readonly string[];

  /**
   * Get the IDs of goals that the given goal depends on.
   */
  getDependencies(goalId: string): readonly string[];

  /**
   * Get all goal IDs in the graph.
   */
  getAllGoalIds(): readonly string[];

  /**
   * Get the current status of a goal.
   */
  getGoalStatus(goalId: string): GoalStatus;

  /**
   * Detect cycles in the dependency graph.
   * Returns the cycle path if one exists, null if the graph is a valid DAG.
   */
  detectCycle(): readonly string[] | null;

  /**
   * Get the critical path — the longest chain of dependencies
   * that determines the minimum build duration.
   */
  getCriticalPath(): readonly string[];
}

// ---------------------------------------------------------------------------
// Orchestrator configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for the Cortex Orchestrator.
 *
 * Spec Section 3.2 — the Cortex is an Opus 4.6 API session that coordinates
 * the build but does not relay messages or decompose work.
 */
export interface IOrchestratorConfig {
  /** The build ID this orchestrator manages. */
  readonly buildId: string;

  /** Absolute path to the git repository root. */
  readonly repoPath: string;

  /** Branch to use as the base for the build. Default: "main". */
  readonly baseBranch?: string;

  /** Anthropic API key (defaults to ANTHROPIC_API_KEY env var). */
  readonly apiKey?: string;

  /**
   * Maximum number of concurrent agents.
   * The orchestrator will not launch more agents than this even if the
   * frontier has more eligible goals. Default: 12.
   *
   * Spec Section 3.2 — "typically 4-12 for a medium-complexity app."
   */
  readonly maxConcurrentAgents?: number;

  /**
   * Default model tier for builder agents.
   * The routing layer can override per-goal based on trail coverage.
   * Default: "claude-opus-4-6".
   */
  readonly defaultModelTier?: ModelTier;

  /** Test command for merge gate Check 4. */
  readonly testCommand?: readonly string[];

  /** Path to tsconfig.json for merge gate Check 2. */
  readonly tsconfigPath?: string;
}

// ---------------------------------------------------------------------------
// Orchestrator events
// ---------------------------------------------------------------------------

/** Events emitted by the orchestrator for build lifecycle tracking. */
export type OrchestratorEventType =
  | "build-initialized"       // Dependency graph constructed, ready to start
  | "frontier-updated"        // Frontier recalculated — new eligible goals
  | "agent-launched"          // Agent assigned to a goal and launched
  | "merge-result-received"   // Merge gate returned a result
  | "goal-status-changed"     // A goal transitioned to a new status
  | "build-phase-changed"     // Build entered a new phase
  | "deadlock-detected"       // No frontier goals and incomplete build
  | "build-complete";         // All goals merged successfully

/** An event emitted by the orchestrator. */
export interface IOrchestratorEvent {
  readonly type: OrchestratorEventType;
  readonly buildId: string;
  readonly timestamp: Date;
  readonly payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Orchestrator interface
// ---------------------------------------------------------------------------

/**
 * ICortexOrchestrator — the central coordinator for a build.
 *
 * Instantiated once per build. Owns the dependency graph, manages the
 * frontier, launches agents via the harness, and processes merge results.
 *
 * Spec Section 3.2 — "Builds the dependency graph from ICE's output,
 * assigns goals to agents based on competence scoring, constructs the
 * peer communication graph, monitors build state, and intervenes only
 * for deadlocks, cross-graph impacts, or replanning."
 *
 * Spec Section 4.1 — "There are NO 'waves' in Cortex. Instead, the Cortex
 * analyzes the full goal set and builds a dependency graph."
 */
export interface ICortexOrchestrator {
  /** The build ID this orchestrator manages. */
  readonly buildId: string;

  /**
   * Initialize the orchestrator with goal assignments from ICE/Architect.
   * Builds the dependency graph, creates the integration branch, and
   * constructs the peer communication graph.
   *
   * Must be called before start().
   */
  initialize(goals: readonly IGoalAssignment[]): Promise<void>;

  /**
   * Start the build — compute the initial frontier and launch agents
   * for all eligible goals (those with zero dependencies).
   *
   * Spec Section 4.1 — "the Cortex launches everything with zero
   * unmet dependencies simultaneously."
   */
  start(): Promise<void>;

  /**
   * Process a merge gate result.
   *
   * On success: marks the goal as "merged", recalculates the frontier,
   * launches agents for newly eligible goals, terminates the agent.
   *
   * On failure: sends diagnostics back to the agent for remediation.
   * The agent remains assigned and can resubmit after fixing issues.
   *
   * Spec Section 4.1 — "As dependencies are satisfied (a goal's work
   * merges), downstream goals become eligible."
   */
  handleMergeResult(result: IMergeGateResult): Promise<void>;

  /**
   * Submit a merge request for a goal. The orchestrator coordinates
   * with the build repository to run the five-check gate.
   */
  submitMerge(agentId: string, goalId: string): Promise<IMergeGateResult>;

  /**
   * Get the current dependency graph.
   */
  getGraph(): IDependencyGraph;

  /**
   * Get the current frontier — eligible goals not yet assigned.
   */
  getFrontier(): readonly string[];

  /**
   * Get progress for all goals.
   */
  getGoalProgress(): ReadonlyMap<string, GoalProgress>;

  /**
   * Get the merge history for this build.
   */
  getMergeHistory(): readonly IMergeRecord[];

  /**
   * Get the peer communication graph for this build.
   */
  getPeerGraph(): IGraphMeshConfig;

  /**
   * Subscribe to orchestrator events.
   */
  onEvent(handler: (event: IOrchestratorEvent) => void): void;

  /**
   * Gracefully shut down the orchestrator.
   * Terminates all active agents and cleans up branches.
   */
  shutdown(): Promise<void>;
}
