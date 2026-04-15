/**
 * Build state management interfaces — the Build State Manager, ESAA events,
 * and the anchored state preservation system.
 *
 * Spec Section 5.2 — Golden Window Management
 * Spec Section 5.4 — Agent Rotation and Warm-Up Sequences
 * Spec Section 5.5 — State Transfer Between Agents (ESAA)
 */

// ---------------------------------------------------------------------------
// ESAA events
// ---------------------------------------------------------------------------

/**
 * Categories of ESAA events.
 * Spec Section 5.5 — agents emit structured intentions in validated JSON.
 */
export type ESAAEventCategory =
  | "decision"           // Agent made an implementation decision
  | "interface-proposal" // Agent proposed an interface change to a peer
  | "interface-accept"   // Agent accepted a peer's interface proposal
  | "interface-reject"   // Agent rejected a peer's interface proposal
  | "goal-progress"      // Agent progressed on its goal
  | "error-encountered"  // Agent encountered an error
  | "error-resolved"     // Agent resolved an error
  | "merge-submitted"    // Agent submitted work to the merge gate
  | "rotation-triggered" // Agent rotation was triggered
  | "spawn-sub-agent"    // Agent spawned an ephemeral sub-agent
  | "peer-message";      // Agent sent a graph-mesh message to a peer

/**
 * IESAAEvent — a single event in the append-only event log.
 *
 * The critical innovation: separating cognitive intention from state mutation
 * enables time-travel debugging via event replay.
 *
 * Spec Section 5.5 — "Validated with four heterogeneous LLM agents running
 * concurrently — 86 events over 15 hours with SHA-256 hashing for state integrity."
 */
export interface IESAAEvent {
  /** Monotonically increasing event ID. */
  readonly id: string;
  /** The build this event belongs to. */
  readonly buildId: string;
  /** The agent session that emitted this event. */
  readonly agentId: string;
  /** Event category. */
  readonly category: ESAAEventCategory;
  /** Human-readable description of the intention. */
  readonly description: string;
  /** Structured payload for programmatic consumption. */
  readonly payload: Record<string, unknown>;
  /** SHA-256 hash of the previous event + this event for state integrity. */
  readonly integrityHash: string;
  /** When this event was emitted. */
  readonly timestamp: Date;
}

// ---------------------------------------------------------------------------
// Build state
// ---------------------------------------------------------------------------

/**
 * IBuildState — the current state of a build, maintained by the Build State Tracker.
 * This is the Tier 1 shared service that all agents can query.
 *
 * Spec Section 4.2 — Tier 1 Shared Services Layer.
 */
export interface IBuildState {
  readonly buildId: string;
  /** Map of agent IDs to their current state. */
  readonly agents: ReadonlyMap<string, IAgentState>;
  /** Current goal status for every goal in the build. */
  readonly goals: ReadonlyMap<string, GoalProgress>;
  /** Merge history — ordered list of successful merges. */
  readonly mergeHistory: readonly IMergeRecord[];
  /** Current integration branch commit SHA. */
  readonly integrationHead: string;
  /** Last updated timestamp. */
  readonly updatedAt: Date;
}

/** Agent state as tracked by the Build State Tracker. */
export interface IAgentState {
  readonly agentId: string;
  readonly role: string;
  readonly goalId: string | null;
  readonly contextFillRatio: number;
  readonly status: "active" | "rotating" | "completed" | "fired";
  readonly lastEventAt: Date;
}

/** Progress of a single goal. */
export interface GoalProgress {
  readonly goalId: string;
  readonly status: "blocked" | "eligible" | "assigned" | "submitted" | "merged" | "failed";
  readonly assignedAgentId: string | null;
  /** Estimated completion progress (0-1), reported by the agent. */
  readonly progress: number;
}

/** Record of a successful merge to the integration branch. */
export interface IMergeRecord {
  readonly commitSha: string;
  readonly agentId: string;
  readonly goalId: string;
  readonly mergedAt: Date;
}

// ---------------------------------------------------------------------------
// Anchored state document
// ---------------------------------------------------------------------------

/**
 * The four-field anchored state document maintained outside the agent's context.
 * Injected after every compaction event to restore golden window.
 *
 * Spec Section 5.2, Mechanism 2 — Factory.ai-Style Anchored State Preservation.
 */
export interface IAnchoredState {
  /** What the agent is trying to accomplish and why. */
  readonly intent: string;
  /** What has been built, modified, and merged so far. */
  readonly changes: string;
  /** Key implementation decisions made and their reasoning. */
  readonly decisions: string;
  /** What remains and what the immediate priorities are. */
  readonly nextSteps: string;
}

// ---------------------------------------------------------------------------
// Build State Manager — Tier 1 shared service (Phase B, Step 10)
// ---------------------------------------------------------------------------

/**
 * Categories of build-level events aggregated from agent ESAA events.
 *
 * Spec Section 4.2, Tier 1 — Build State Tracker aggregates agent-level
 * ESAA events into build-level state transitions.
 */
export type BuildStateEventCategory =
  | "agent-spawned"         // A new agent joined the build
  | "agent-completed"       // An agent finished its goal successfully
  | "agent-rotated"         // An agent was rotated due to drift/threshold
  | "agent-fired"           // An agent was terminated for quality violations
  | "goal-assigned"         // A goal was assigned to an agent
  | "goal-progress"         // A goal made measurable progress
  | "goal-completed"        // A goal was completed (merged to integration)
  | "goal-failed"           // A goal failed (agent fired, abandoned)
  | "merge-completed"       // A merge to integration branch succeeded
  | "blueprint-revised"     // The architectural blueprint was updated
  | "rotation-initiated"    // Rotation protocol began for an agent
  | "rotation-completed";   // Rotation completed — replacement launched

/**
 * IBuildStateEvent — a build-level event aggregated from agent ESAA events.
 *
 * These events provide the Build State Manager with the information it needs
 * to maintain accurate, real-time build state. Unlike raw ESAA events (which
 * capture individual agent cognitive intentions), build state events represent
 * meaningful state transitions visible to the orchestrator.
 *
 * Spec Section 4.2 — Build State Tracker as Tier 1 shared service.
 */
export interface IBuildStateEvent {
  /** Unique event identifier. */
  readonly id: string;
  /** The build this event belongs to. */
  readonly buildId: string;
  /** Event category. */
  readonly category: BuildStateEventCategory;
  /** The agent this event relates to (if applicable). */
  readonly agentId: string | null;
  /** The goal this event relates to (if applicable). */
  readonly goalId: string | null;
  /** Human-readable description. */
  readonly description: string;
  /** Structured payload for programmatic consumption. */
  readonly payload: Record<string, unknown>;
  /** When this event occurred. */
  readonly timestamp: Date;
}

/**
 * IBuildStateManager — maintains live build state from ESAA events.
 *
 * The Build State Manager is a Tier 1 shared service (spec Section 4.2) that:
 * - Tracks all active agent states (status, context fill, goal assignment)
 * - Maintains goal progress across the entire build
 * - Aggregates agent-level ESAA events into build-level state events
 * - Provides snapshot queries for the orchestrator and other services
 * - Tracks merge history and integration branch status
 *
 * This is the central state-of-the-world service that survives individual
 * agent lifecycles. When an agent is rotated, the Build State Manager
 * continues uninterrupted, providing the replacement agent's warm-up
 * sequence with accurate current state.
 *
 * Spec Section 4.2 — "Build State Tracker: Agent status, goal progress,
 * merge history. Per-build session."
 * Spec Section 5.2 — Golden Window Management (anchored state source).
 * Spec Section 5.4 — Agent Rotation (state source for warm-up construction).
 */
export interface IBuildStateManager {
  /**
   * Initialize the manager for a new build session.
   * Sets up the build ID and initial goal set from the blueprint.
   */
  initializeBuild(
    buildId: string,
    goalIds: readonly string[],
  ): void;

  /**
   * Process an ESAA event from an agent and update build state accordingly.
   * This is the primary input — the manager derives all state from ESAA events.
   */
  processESAAEvent(event: IESAAEvent): void;

  /**
   * Register a new agent in the build.
   * Called when the orchestrator spawns or rotates in a new agent.
   */
  registerAgent(
    agentId: string,
    role: string,
    goalId: string | null,
  ): void;

  /**
   * Update an agent's context fill ratio.
   * Called by the orchestrator when the TokenMonitor reports usage.
   */
  updateAgentContextFill(agentId: string, fillRatio: number): void;

  /**
   * Mark an agent as rotated, completed, or fired.
   */
  updateAgentStatus(
    agentId: string,
    status: "active" | "rotating" | "completed" | "fired",
  ): void;

  /**
   * Update a goal's progress from an agent's self-reported progress.
   */
  updateGoalProgress(
    goalId: string,
    progress: number,
    agentId: string,
  ): void;

  /**
   * Record a successful merge to the integration branch.
   */
  recordMerge(
    commitSha: string,
    agentId: string,
    goalId: string,
  ): void;

  /**
   * Get the current complete build state snapshot.
   * Used by the orchestrator, warm-up builder, and other Tier 1 services.
   */
  getBuildState(): IBuildState;

  /**
   * Get a single agent's state.
   */
  getAgentState(agentId: string): IAgentState | undefined;

  /**
   * Get a single goal's progress.
   */
  getGoalProgress(goalId: string): GoalProgress | undefined;

  /**
   * Get the build state event history (ordered chronologically).
   * Optionally filter by category.
   */
  getEvents(
    filter?: { readonly categories?: readonly BuildStateEventCategory[] },
  ): readonly IBuildStateEvent[];

  /**
   * Subscribe to build state events as they occur.
   * Returns an unsubscribe function.
   */
  onEvent(handler: (event: IBuildStateEvent) => void): () => void;

  /**
   * Get agent IDs that are currently active on a build.
   */
  getActiveAgentIds(): readonly string[];

  /**
   * Reset the manager for a new build (clears all state).
   */
  reset(): void;
}

// ---------------------------------------------------------------------------
// Warm-Up Sequence Builder (Phase B, Step 10)
// ---------------------------------------------------------------------------

/**
 * IWarmUpContext — the full context needed to construct a replacement
 * agent's golden window formation sequence during rotation.
 *
 * The Build State Manager gathers this from multiple Tier 1 services
 * and passes it to the warm-up builder, which constructs the
 * IGoldenWindowSequence that puts the replacement into its golden window.
 *
 * Spec Section 5.4 — "The Build State Manager replicates the golden window
 * formation sequence for the replacement agent."
 */
export interface IWarmUpContext {
  /** The build this rotation belongs to. */
  readonly buildId: string;
  /** The rotation result containing the departing agent's captured state. */
  readonly departedAgentState: import("./agents.js").IDepartingAgentState;
  /** The goal being handed off to the replacement. */
  readonly goal: import("./agents.js").IGoalAssignment;
  /** The agent role for the replacement. */
  readonly role: import("./agents.js").AgentRole;
  /** Path to the repository root. */
  readonly repoPath: string;
  /** The integration branch to read project structure from. */
  readonly integrationBranch: string;
  /** The current architectural blueprint. */
  readonly blueprint: import("./architect.js").IArchitecturalBlueprint;
  /** The current living specification. */
  readonly livingSpec: import("./ice.js").ILivingSpecification;
  /** Ranked experiential trails for this goal type. */
  readonly trails: readonly import("./knowledge.js").IRankedTrail[];
  /** Anti-pattern alerts relevant to upcoming work. */
  readonly antiPatternAlerts: readonly string[];
  /** Current build state snapshot (for plan-with-progress construction). */
  readonly buildState: IBuildState;
}

/**
 * IWarmUpSequenceBuilder — constructs golden window formation sequences
 * for replacement agents during rotation.
 *
 * This is the orchestration component described in spec Section 5.4 that
 * "replicates the golden window formation sequence for the replacement agent."
 * It bridges the RotationProtocol (which captures departing state) with the
 * GoldenWindowBuilder (which constructs the eight-step formation sequence).
 *
 * The warm-up builder adds rotation-specific intelligence:
 * - Integrates the departing agent's captured state into the golden window
 * - Selects additional code files the departing agent was working with
 * - Includes any new experiential trails from the departing agent's session
 * - Produces the warm-up quality assessment hooks for Step 4 outcome recording
 *
 * Spec Section 5.4 — Agent Rotation and Warm-Up Sequences.
 * Spec Section 5.2 — Golden Window Management (mechanisms 1-4).
 */
export interface IWarmUpSequenceBuilder {
  /**
   * Construct the complete golden window formation sequence for a
   * replacement agent during rotation.
   *
   * Spec Section 5.4, Step 2 — "Construct the golden window formation
   * sequence" with all eight steps including the departing agent's state.
   */
  buildWarmUpSequence(
    context: IWarmUpContext,
  ): Promise<import("./agents.js").IGoldenWindowSequence>;

  /**
   * Estimate the token cost of a warm-up sequence before constructing it.
   * Used by the EnhancedThresholdMonitor for cost-benefit rotation decisions.
   */
  estimateWarmUpCost(
    context: IWarmUpContext,
  ): number;
}
