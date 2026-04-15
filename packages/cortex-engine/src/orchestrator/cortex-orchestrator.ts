/**
 * Cortex Orchestrator — the central coordinator for a build.
 *
 * Ties together:
 * - Phase A Step 1: Agent Harness (launching and managing agent sessions)
 * - Phase A Step 2: Build Repository (branch isolation and merge gate)
 * - Dependency Graph (this step: frontier scheduling)
 *
 * The orchestrator builds the dependency graph from goal assignments,
 * continuously calculates the frontier, launches agents for eligible goals,
 * processes merge results, and advances the frontier.
 *
 * The orchestrator does NOT:
 * - Relay messages between agents (graph-mesh is peer-to-peer)
 * - Decompose goals into sub-tasks (agents are autonomous)
 * - Poll agent status on a timer (event-driven via ESAA)
 * - Dictate HOW agents implement their goals
 *
 * Spec Section 3.2 — Cortex Orchestrator taxonomy.
 * Spec Section 4.1 — Dependency-Graph-Driven Scheduling.
 * Spec Section 12.4, Phase A Step 3.
 */

import type {
  ICortexOrchestrator,
  IOrchestratorConfig,
  IOrchestratorEvent,
  OrchestratorEventType,
  IGoalAssignment,
  GoalStatus,
  GoalProgress,
  IMergeRecord,
  IMergeGateResult,
  IGraphMeshConfig,
  IGraphEdge,
  IAgentHarnessConfig,
  IGoldenWindowSequence,
  IMergeRequest,
  IESAAEvent,
  IAgentSessionEvent,
} from "@kriptik/shared-interfaces";
import { AgentHarness } from "../agents/agent-harness.js";
import { ESAAEmitter } from "../agents/esaa-emitter.js";
import { BuildRepository } from "../git/build-repository.js";
import { DependencyGraph } from "./dependency-graph.js";

/** Map of agent IDs to the goal IDs they're working on. */
type AgentGoalMap = Map<string, string>;

/** Map of goal IDs to the agent branch names. */
type GoalBranchMap = Map<string, string>;

/**
 * The Cortex Orchestrator — ties Steps 1, 2, and 3 together
 * into the core build loop.
 */
export class CortexOrchestrator implements ICortexOrchestrator {
  readonly buildId: string;

  private readonly _config: Required<
    Pick<IOrchestratorConfig, "maxConcurrentAgents" | "defaultModelTier" | "baseBranch">
  > & IOrchestratorConfig;

  private readonly _harness: AgentHarness;
  private readonly _repository: BuildRepository;
  private readonly _graph: DependencyGraph;
  private readonly _esaa: ESAAEmitter;

  /** Goals stored by ID for quick lookup. */
  private readonly _goals = new Map<string, IGoalAssignment>();
  /** Map agent session IDs to the goal they're working on. */
  private readonly _agentGoals: AgentGoalMap = new Map();
  /** Map goal IDs to their agent branch name. */
  private readonly _goalBranches: GoalBranchMap = new Map();
  /** Successful merge records. */
  private readonly _mergeHistory: IMergeRecord[] = [];
  /** Peer communication graph. */
  private _peerGraph: IGraphMeshConfig = { buildId: "", edges: [] };
  /** Event handlers. */
  private readonly _eventHandlers: Array<(event: IOrchestratorEvent) => void> = [];
  /** Whether initialize() has been called. */
  private _initialized = false;
  /** Whether start() has been called. */
  private _started = false;

  constructor(config: IOrchestratorConfig) {
    this.buildId = config.buildId;

    this._config = {
      ...config,
      maxConcurrentAgents: config.maxConcurrentAgents ?? 12,
      defaultModelTier: config.defaultModelTier ?? "claude-opus-4-6",
      baseBranch: config.baseBranch ?? "main",
    };

    this._harness = new AgentHarness(config.apiKey);
    this._repository = new BuildRepository({
      repoPath: config.repoPath,
      baseBranch: this._config.baseBranch,
      tsconfigPath: config.tsconfigPath,
      testCommand: config.testCommand,
    });
    this._graph = new DependencyGraph();

    // The orchestrator has its own ESAA emitter for orchestrator-level events
    this._esaa = new ESAAEmitter(this.buildId, `orchestrator:${this.buildId}`);

    // Wire harness ESAA events through for observability
    this._harness.onESAAEvent((event: IESAAEvent) => {
      this._handleAgentESAAEvent(event);
    });

    // Wire session lifecycle events for rotation/threshold monitoring
    this._harness.onSessionEvent((event: IAgentSessionEvent) => {
      this._handleAgentSessionEvent(event);
    });
  }

  async initialize(goals: readonly IGoalAssignment[]): Promise<void> {
    if (this._initialized) {
      throw new Error("Orchestrator already initialized");
    }

    // Store goals and build the dependency graph
    for (const goal of goals) {
      this._goals.set(goal.id, goal);
      this._graph.addGoal(goal);
    }

    // Validate the graph is a DAG (no cycles)
    const cycle = this._graph.detectCycle();
    if (cycle) {
      throw new Error(
        `Dependency cycle detected in goal graph: ${cycle.join(" → ")}`,
      );
    }

    // Initialize the git branch structure
    await this._repository.initializeBuild(this.buildId);

    // Construct the peer communication graph from dependency overlap
    this._peerGraph = this._buildPeerGraph(goals);

    this._initialized = true;

    this._esaa.emit("goal-progress", "Build initialized with dependency graph", {
      goalCount: goals.length,
      topologicalOrder: this._graph.getTopologicalOrder(),
      criticalPath: this._graph.getCriticalPath(),
      initialFrontier: this._graph.getFrontier(),
    });

    this._emitEvent("build-initialized", {
      goalCount: goals.length,
      frontierSize: this._graph.getFrontier().length,
    });
  }

  async start(): Promise<void> {
    if (!this._initialized) {
      throw new Error("Orchestrator must be initialized before starting");
    }
    if (this._started) {
      throw new Error("Orchestrator already started");
    }

    this._started = true;

    this._emitEvent("build-phase-changed", { phase: "executing" });

    // Compute initial frontier and launch agents
    await this._launchFrontierAgents();
  }

  async handleMergeResult(result: IMergeGateResult): Promise<void> {
    const goalId = result.goalId;
    const goal = this._goals.get(goalId);
    if (!goal) {
      throw new Error(`Unknown goal ${goalId} in merge result`);
    }

    this._esaa.emit("merge-submitted", `Merge gate result for goal ${goalId}`, {
      goalId,
      agentId: result.agentId,
      passed: result.passed,
      checks: result.checks.map((c) => ({
        check: c.check,
        passed: c.passed,
      })),
    });

    this._emitEvent("merge-result-received", {
      goalId,
      agentId: result.agentId,
      passed: result.passed,
    });

    if (result.passed) {
      // Goal merged successfully
      this._graph.updateGoalStatus(goalId, "merged");

      // Record the merge
      this._mergeHistory.push({
        commitSha: result.mergeCommitSha ?? "unknown",
        agentId: result.agentId,
        goalId,
        mergedAt: new Date(),
      });

      // Terminate the agent that completed this goal
      await this._harness.terminate(result.agentId);
      this._agentGoals.delete(result.agentId);

      this._emitEvent("goal-status-changed", {
        goalId,
        status: "merged" as GoalStatus,
      });

      // Check if downstream goals became eligible
      const dependents = this._graph.getDependents(goalId);
      const newlyEligible: string[] = [];
      for (const depId of dependents) {
        const depStatus = this._graph.getGoalStatus(depId);
        if (depStatus === "eligible") {
          newlyEligible.push(depId);
        }
      }

      if (newlyEligible.length > 0) {
        this._emitEvent("frontier-updated", {
          newlyEligible,
          frontierSize: this._graph.getFrontier().length,
        });
      }

      // Launch agents for newly eligible goals
      await this._launchFrontierAgents();

      // Check if all goals are merged (build complete)
      if (this._isAllGoalsMerged()) {
        this._emitEvent("build-phase-changed", { phase: "verifying" });
        this._emitEvent("build-complete", {
          totalGoals: this._goals.size,
          mergeHistory: this._mergeHistory,
        });
      }
    } else {
      // Merge failed — agent stays assigned and should remediate
      // The agent receives the full diagnostics and can fix + resubmit
      this._graph.updateGoalStatus(goalId, "assigned");

      this._esaa.emit("error-encountered", `Merge gate rejected goal ${goalId}`, {
        goalId,
        failedChecks: result.checks
          .filter((c) => !c.passed)
          .map((c) => c.check),
      });
    }
  }

  async submitMerge(
    agentId: string,
    goalId: string,
  ): Promise<IMergeGateResult> {
    const goal = this._goals.get(goalId);
    if (!goal) {
      throw new Error(`Unknown goal ${goalId}`);
    }

    const agentBranch = this._goalBranches.get(goalId);
    if (!agentBranch) {
      throw new Error(`No branch found for goal ${goalId}`);
    }

    const branches = await this._repository.getBuildBranches(this.buildId);
    if (!branches) {
      throw new Error(`No branch structure found for build ${this.buildId}`);
    }

    // Update goal status to submitted
    this._graph.updateGoalStatus(goalId, "submitted");
    this._emitEvent("goal-status-changed", {
      goalId,
      status: "submitted" as GoalStatus,
    });

    const mergeRequest: IMergeRequest = {
      buildId: this.buildId,
      agentId,
      goalId,
      sourceBranch: agentBranch,
      targetBranch: branches.integrationBranch,
      goal,
    };

    const result = await this._repository.submitMerge(mergeRequest);

    // Process the result through our normal handler
    await this.handleMergeResult(result);

    return result;
  }

  getGraph(): DependencyGraph {
    return this._graph;
  }

  getFrontier(): readonly string[] {
    return this._graph.getFrontier();
  }

  getGoalProgress(): ReadonlyMap<string, GoalProgress> {
    const progress = new Map<string, GoalProgress>();

    for (const [goalId] of this._goals) {
      const status = this._graph.getGoalStatus(goalId);
      const agentId = this._findAgentForGoal(goalId);

      progress.set(goalId, {
        goalId,
        status,
        assignedAgentId: agentId,
        progress: status === "merged" ? 1 : 0,
      });
    }

    return progress;
  }

  getMergeHistory(): readonly IMergeRecord[] {
    return this._mergeHistory;
  }

  getPeerGraph(): IGraphMeshConfig {
    return this._peerGraph;
  }

  onEvent(handler: (event: IOrchestratorEvent) => void): void {
    this._eventHandlers.push(handler);
  }

  async shutdown(): Promise<void> {
    // Terminate all active agent sessions
    const activeSessions = this._harness.getActiveSessions();
    for (const session of activeSessions) {
      await this._harness.terminate(session.session.id);
    }

    // Clean up build branches
    await this._repository.cleanupBuild(this.buildId);

    this._esaa.emit("goal-progress", "Orchestrator shutting down", {
      mergeCount: this._mergeHistory.length,
      activeAgents: 0,
    });
  }

  // =========================================================================
  // Private methods
  // =========================================================================

  /**
   * Launch agents for all eligible goals on the frontier,
   * up to the concurrent agent limit.
   */
  private async _launchFrontierAgents(): Promise<void> {
    const frontier = this._graph.getFrontier();
    const activeCount = this._harness.getActiveSessions().length;
    const slotsAvailable = this._config.maxConcurrentAgents - activeCount;

    if (slotsAvailable <= 0 || frontier.length === 0) {
      // Check for deadlock: no frontier and incomplete build
      if (frontier.length === 0 && !this._isAllGoalsMerged() && activeCount === 0) {
        this._emitEvent("deadlock-detected", {
          remainingGoals: this._getRemainingGoalIds(),
        });
      }
      return;
    }

    const goalsToLaunch = frontier.slice(0, slotsAvailable);

    for (const goalId of goalsToLaunch) {
      await this._launchAgentForGoal(goalId);
    }
  }

  /**
   * Launch a single agent for a goal.
   *
   * Creates the agent's working branch, builds the harness config
   * with a golden window, and launches via the harness.
   */
  private async _launchAgentForGoal(goalId: string): Promise<void> {
    const goal = this._goals.get(goalId);
    if (!goal) {
      throw new Error(`Goal ${goalId} not found`);
    }

    // Create a branch suffix from the goal description
    const branchSuffix = this._goalToBranchSuffix(goalId, goal.description);

    // Create the agent's working branch
    const branchName = await this._repository.createAgentBranch(
      this.buildId,
      goalId, // Use goal ID as the agent identifier for branch creation
      branchSuffix,
    );

    this._goalBranches.set(goalId, branchName);

    // Build golden window (simplified for Phase A Step 3)
    // Full golden window construction moves to the Architect agent in Step 5
    const goldenWindow = this._buildGoldenWindow(goal);

    // Determine peer IDs from the communication graph
    const peerIds = this._getPeerIds(goalId);

    const config: IAgentHarnessConfig = {
      buildId: this.buildId,
      role: "builder",
      modelTier: goal.recommendedModelTier ?? this._config.defaultModelTier,
      goal,
      peerIds,
      goldenWindow,
      tools: [], // Tools will be configured per agent in Step 4 (containers)
    };

    // Launch the agent
    const session = await this._harness.launch(config);
    const agentId = session.session.id;

    // Track the agent→goal mapping
    this._agentGoals.set(agentId, goalId);

    // Mark goal as assigned
    this._graph.updateGoalStatus(goalId, "assigned");

    this._esaa.emit("decision", `Assigned goal ${goalId} to agent ${agentId}`, {
      goalId,
      agentId,
      modelTier: config.modelTier,
      branch: branchName,
      peerIds,
    });

    this._emitEvent("agent-launched", {
      agentId,
      goalId,
      modelTier: config.modelTier,
      branch: branchName,
    });

    this._emitEvent("goal-status-changed", {
      goalId,
      status: "assigned" as GoalStatus,
    });
  }

  /**
   * Build a simplified golden window for the agent.
   *
   * Full golden window construction (with trails, blueprint sections,
   * relevant code) is the Architect agent's responsibility (Step 5).
   * For now, we provide the essential structure.
   */
  private _buildGoldenWindow(goal: IGoalAssignment): IGoldenWindowSequence {
    return {
      systemPrompt: [
        `You are an autonomous builder agent in the Cortex Engine.`,
        `Your goal: ${goal.description}`,
        ``,
        `You have FULL AUTONOMY to implement this goal. You decide the approach,`,
        `the structure, the error handling, and the testing strategy.`,
        ``,
        `RULES:`,
        `- Write ONLY to files within your scoped paths: ${goal.scopedWritePaths.join(", ")}`,
        `- Verify your own work before submitting (run tests, check types)`,
        `- If you need to change something outside your scope, communicate with peers`,
        `- When done, submit your work for merge gate evaluation`,
      ].join("\n"),
      projectStructure: "", // Populated by Architect in Step 5
      planWithProgress: goal.specSections.join("\n\n"),
      architecturalBlueprint: goal.blueprintSections.join("\n\n"),
      relevantCode: [],     // Populated by Architect in Step 5
      trails: [],           // Populated by Knowledge system in Phase B
      antiPatternAlerts: [], // Populated by Knowledge system in Phase B
    };
  }

  /**
   * Construct the peer communication graph from dependency overlap.
   *
   * Two goals that share a dependency (or where one depends on the other)
   * should have their agents connected for direct communication.
   *
   * Spec Section 3.3 — "When the Cortex assigns goals, it also constructs
   * a peer communication graph based on the task dependency map."
   */
  private _buildPeerGraph(goals: readonly IGoalAssignment[]): IGraphMeshConfig {
    const edges: IGraphEdge[] = [];
    const goalIds = goals.map((g) => g.id);

    for (let i = 0; i < goalIds.length; i++) {
      for (let j = i + 1; j < goalIds.length; j++) {
        const goalA = goalIds[i];
        const goalB = goalIds[j];

        const connection = this._determineConnection(goalA, goalB);
        if (connection) {
          edges.push({
            agentA: goalA,
            agentB: goalB,
            direction: connection.direction,
            reason: connection.reason,
          });
        }
      }
    }

    return {
      buildId: this.buildId,
      edges,
    };
  }

  /**
   * Determine if two goals need peer communication.
   *
   * Connection is established when:
   * - One goal directly depends on the other (dependent gets feedback channel)
   * - Both goals share a common dependency (may need to coordinate)
   * - Goals have overlapping interface contracts
   */
  private _determineConnection(
    goalA: string,
    goalB: string,
  ): { direction: IGraphEdge["direction"]; reason: string } | null {
    const depsA = new Set(this._graph.getDependencies(goalA));
    const depsB = new Set(this._graph.getDependencies(goalB));

    // Direct dependency: A depends on B
    if (depsA.has(goalB)) {
      return {
        direction: "bidirectional",
        reason: `${goalA} depends on ${goalB} — interface coordination required`,
      };
    }

    // Direct dependency: B depends on A
    if (depsB.has(goalA)) {
      return {
        direction: "bidirectional",
        reason: `${goalB} depends on ${goalA} — interface coordination required`,
      };
    }

    // Shared dependency: both depend on a common goal
    for (const dep of depsA) {
      if (depsB.has(dep)) {
        return {
          direction: "bidirectional",
          reason: `Both depend on ${dep} — may need to coordinate shared interfaces`,
        };
      }
    }

    // Check for overlapping interface contracts
    const goalObjA = this._goals.get(goalA);
    const goalObjB = this._goals.get(goalB);
    if (goalObjA && goalObjB) {
      const contractsA = new Set(
        goalObjA.interfaceContracts.map((c) => c.interfacePath),
      );
      for (const contract of goalObjB.interfaceContracts) {
        if (contractsA.has(contract.interfacePath)) {
          return {
            direction: "bidirectional",
            reason: `Shared interface contract: ${contract.interfacePath}`,
          };
        }
      }
    }

    return null;
  }

  /**
   * Get peer agent IDs for a goal from the peer communication graph.
   */
  private _getPeerIds(goalId: string): readonly string[] {
    const peers: string[] = [];

    for (const edge of this._peerGraph.edges) {
      if (edge.agentA === goalId) {
        peers.push(edge.agentB);
      } else if (edge.agentB === goalId) {
        peers.push(edge.agentA);
      }
    }

    return peers;
  }

  /**
   * Convert a goal ID + description into a safe branch suffix.
   */
  private _goalToBranchSuffix(goalId: string, description: string): string {
    // Extract a short, meaningful suffix from the description
    const slug = description
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 30);

    return slug || goalId.slice(0, 8);
  }

  /**
   * Find the agent session ID currently working on a goal.
   */
  private _findAgentForGoal(goalId: string): string | null {
    for (const [agentId, gId] of this._agentGoals) {
      if (gId === goalId) return agentId;
    }
    return null;
  }

  /**
   * Check if all goals in the graph are merged.
   */
  private _isAllGoalsMerged(): boolean {
    for (const goalId of this._graph.getAllGoalIds()) {
      if (this._graph.getGoalStatus(goalId) !== "merged") {
        return false;
      }
    }
    return true;
  }

  /**
   * Get IDs of goals that are not yet merged.
   */
  private _getRemainingGoalIds(): readonly string[] {
    const remaining: string[] = [];
    for (const goalId of this._graph.getAllGoalIds()) {
      if (this._graph.getGoalStatus(goalId) !== "merged") {
        remaining.push(goalId);
      }
    }
    return remaining;
  }

  /**
   * Handle ESAA events from agent sessions.
   * The orchestrator subscribes for awareness and trail capture
   * but does NOT route or approve agent decisions.
   */
  private _handleAgentESAAEvent(_event: IESAAEvent): void {
    // In Phase B, ESAA events will be persisted to the trail system.
    // For now, they flow through for observability.
  }

  /**
   * Handle agent session lifecycle events.
   * Used for rotation and threshold monitoring.
   */
  private _handleAgentSessionEvent(event: IAgentSessionEvent): void {
    if (event.type === "threshold-critical") {
      // Agent is at rotation-recommended level
      // Full rotation logic is Phase B Step 9 — for now, log it
      this._esaa.emit("rotation-triggered", `Agent ${event.agentId} hit critical threshold`, {
        agentId: event.agentId,
        payload: event.payload,
      });
    }
  }

  /**
   * Emit an orchestrator event to all subscribers.
   */
  private _emitEvent(
    type: OrchestratorEventType,
    payload: Record<string, unknown>,
  ): void {
    const event: IOrchestratorEvent = {
      type,
      buildId: this.buildId,
      timestamp: new Date(),
      payload,
    };

    for (const handler of this._eventHandlers) {
      handler(event);
    }
  }
}
