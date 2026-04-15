/**
 * Agent architecture interfaces — defining how autonomous agents are
 * instantiated, assigned goals, and managed within the Cortex.
 *
 * Spec Section 3.1 — Full Agent Autonomy
 * Spec Section 3.2 — Agent Taxonomy
 * Spec Section 3.3 — Graph-Mesh Peer Communication
 * Spec Section 3.4 — Model Tier Determined by Routing, Not Pairing
 */

// ---------------------------------------------------------------------------
// Model tiers
// ---------------------------------------------------------------------------

/**
 * The two model tiers used by Cortex. No other tiers are permitted.
 * Spec Section 1.4 — Opus 4.6 primary, Sonnet 4.6 secondary. No Haiku.
 */
export type ModelTier = "claude-opus-4-6" | "claude-sonnet-4-6";

// ---------------------------------------------------------------------------
// Agent roles
// ---------------------------------------------------------------------------

/**
 * The distinct agent roles within a Cortex build.
 * Spec Section 3.2 — Agent Taxonomy.
 */
export type AgentRole =
  | "orchestrator"     // Cortex Orchestrator — central coordinator
  | "architect"        // Architectural blueprint + interface contracts
  | "builder"          // Autonomous goal-assigned implementation agent
  | "evaluator"        // Six-layer verification pyramid
  | "sentinel"         // Continuous security monitoring
  | "librarian"        // Knowledge base custodian
  | "design-pioneer"   // Visual experience foundation
  | "navigator"        // UX verification — vision-capable computer-use agent
  | "inspector"        // UX verification — runtime log/console/network monitor
  | "ephemeral";       // Short-lived sub-agent for mechanical tasks (Sonnet 4.6 only)

// ---------------------------------------------------------------------------
// Agent session
// ---------------------------------------------------------------------------

/** Possible states of an agent session. */
export type AgentSessionState =
  | "initializing"    // Golden window being formed
  | "active"          // Agent is working
  | "rotating"        // Being replaced due to drift/threshold
  | "completed"       // Goal achieved, session ended
  | "fired";          // Violation — replaced with positive-only briefing

/**
 * IAgentSession — a single agent's API session wrapper.
 *
 * Each agent is a SEPARATE Anthropic API conversation with its own context
 * window. Agents are NOT orchestration loops — they are autonomous teammates.
 *
 * Spec Section 3.1 — Agents receive GOALS and operate autonomously.
 * Spec Section 5.4 — Golden window formation and rotation.
 */
export interface IAgentSession {
  /** Unique session identifier. */
  readonly id: string;
  /** The build this agent belongs to. */
  readonly buildId: string;
  /** Agent's role in the build. */
  readonly role: AgentRole;
  /** Model tier assigned by the routing layer. */
  readonly modelTier: ModelTier;
  /** Current session state. */
  readonly state: AgentSessionState;
  /** The goal this agent is working on (null for orchestrator/sentinel/librarian). */
  readonly goalId: string | null;
  /** When this session was created. */
  readonly createdAt: Date;

  /** Current token usage in this session's context window. */
  readonly contextTokensUsed: number;
  /** Maximum context window size for this model tier. */
  readonly contextTokensMax: number;
  /** Context fill ratio (0-1). Rotation recommended at 0.4-0.5. Spec Section 5.1. */
  readonly contextFillRatio: number;

  /**
   * IDs of peer agents this agent can communicate with directly via graph-mesh.
   * Spec Section 3.3 — Peer communication graph constructed by the Cortex.
   */
  readonly peerIds: readonly string[];

  /** If this agent was rotated, the ID of the replacement session. */
  readonly replacedById: string | null;
  /** If this agent is a replacement, the ID of the predecessor it replaced. */
  readonly replacesId: string | null;
}

// ---------------------------------------------------------------------------
// Goal assignment
// ---------------------------------------------------------------------------

/**
 * IGoalAssignment — what an agent receives when assigned work.
 *
 * Contains everything the agent needs to operate autonomously: the relevant
 * spec sections, architectural blueprint, interface contracts, experiential
 * trails, technical constraints, anti-pattern alerts, and peer graph.
 *
 * Spec Section 3.1 — "When a builder agent receives its goal assignment
 * from the Cortex, the assignment contains..."
 */
export interface IGoalAssignment {
  /** Unique goal identifier. */
  readonly id: string;
  /** The build this goal belongs to. */
  readonly buildId: string;
  /** Human-readable goal description (e.g. "implement Stripe billing with per-seat pricing"). */
  readonly description: string;

  /**
   * Goal status within the dependency graph.
   * - blocked: dependencies not yet satisfied
   * - eligible: all dependencies met, ready for agent assignment
   * - assigned: agent is working on it
   * - submitted: work submitted to merge gate
   * - merged: passed merge gate and integrated
   * - failed: agent fired, awaiting replacement
   */
  readonly status: GoalStatus;

  /** ID of the agent session currently assigned to this goal. */
  readonly assignedAgentId: string | null;

  /** IDs of goals that must complete before this goal can start. */
  readonly dependsOn: readonly string[];
  /** IDs of goals that depend on this goal's completion. */
  readonly blockedBy: readonly string[];

  /** Scoped write paths — files/directories this agent may modify. Spec Section 4.3, Check 1. */
  readonly scopedWritePaths: readonly string[];

  /** Relevant living specification sections (injected into golden window). */
  readonly specSections: readonly string[];
  /** Relevant architectural blueprint sections. */
  readonly blueprintSections: readonly string[];
  /** Interface contracts: what this goal depends on and what it provides. */
  readonly interfaceContracts: readonly IInterfaceContract[];
  /** IDs of peer agents for graph-mesh communication. */
  readonly peerAgentIds: readonly string[];

  /** Model tier recommended by the routing layer. Spec Section 3.4. */
  readonly recommendedModelTier: ModelTier;
}

export type GoalStatus =
  | "blocked"
  | "eligible"
  | "assigned"
  | "submitted"
  | "merged"
  | "failed";

/**
 * A typed interface contract between components.
 * Spec Section 4.3, Check 3 — Interface contract verification at the merge gate.
 */
export interface IInterfaceContract {
  /** The module/component that provides this interface. */
  readonly provider: string;
  /** The module/component that consumes this interface. */
  readonly consumer: string;
  /** Path to the TypeScript interface definition. */
  readonly interfacePath: string;
  /** Brief description of what this contract covers. */
  readonly description: string;
}

// ---------------------------------------------------------------------------
// Agent harness configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for creating an agent session via the harness.
 *
 * The harness is the subsystem that manages the lifecycle of an Anthropic API
 * session — creating it, injecting the golden window, monitoring token usage,
 * capturing ESAA events, and handling rotation.
 *
 * Spec Section 3.1 — agents are Anthropic API sessions, not orchestration loops.
 * Spec Section 5.4 — golden window formation sequence.
 * Spec Section 12.4, Phase A Step 1 — agent harness instantiation.
 */
export interface IAgentHarnessConfig {
  /** The build this agent belongs to. */
  readonly buildId: string;
  /** Agent's role. */
  readonly role: AgentRole;
  /** Model tier for this agent. */
  readonly modelTier: ModelTier;
  /** Goal assignment (null for orchestrator/sentinel/librarian). */
  readonly goal: IGoalAssignment | null;
  /** IDs of peer agents for graph-mesh communication. */
  readonly peerIds: readonly string[];

  /**
   * The golden window formation sequence — ordered content blocks
   * injected as the initial context to put the agent in its peak state.
   *
   * Spec Section 5.4 — eight-step formation sequence.
   */
  readonly goldenWindow: IGoldenWindowSequence;

  /**
   * MCP tool definitions available to this agent.
   * Spec Section 1.4 — tool use for MCP integration and CLI execution.
   */
  readonly tools: readonly IToolDefinition[];

  /** Context fill ratio at which to flag for rotation attention. Default: 0.4. */
  readonly rotationWarningThreshold?: number;
  /** Context fill ratio at which rotation is strongly recommended. Default: 0.5. */
  readonly rotationCriticalThreshold?: number;

  /** If this agent replaces a rotated predecessor, its ID. */
  readonly replacesId?: string;
}

// ---------------------------------------------------------------------------
// Golden window formation
// ---------------------------------------------------------------------------

/**
 * The golden window formation sequence — the ordered set of content blocks
 * injected into an agent's initial context to establish peak cognitive state.
 *
 * Spec Section 5.4 — the eight-step formation sequence:
 * 1. System prompt + behavioral rules
 * 2. Project structure
 * 3. Plan with progress
 * 4. Architectural blueprint
 * 5. Relevant code files
 * 6. Experiential trails
 * 7. Departing agent's active state (rotation only)
 * 8. Anti-pattern alerts
 */
export interface IGoldenWindowSequence {
  /** System prompt defining the agent's identity, constraints, and behavioral rules. */
  readonly systemPrompt: string;
  /** Current project structure from the integration branch. */
  readonly projectStructure: string;
  /** Plan with completed items checked, current goal highlighted. */
  readonly planWithProgress: string;
  /** Current architectural blueprint version. */
  readonly architecturalBlueprint: string;
  /** Relevant code files for current and next work. */
  readonly relevantCode: readonly ICodeContext[];
  /** Experiential trails ranked for this goal type. */
  readonly trails: readonly string[];
  /** Active state from departing agent (present only during rotation). */
  readonly departingAgentState?: IDepartingAgentState;
  /** Anti-pattern alerts relevant to upcoming work. */
  readonly antiPatternAlerts: readonly string[];
}

/** A code file included in the golden window for context. */
export interface ICodeContext {
  /** File path relative to repository root. */
  readonly path: string;
  /** File contents. */
  readonly content: string;
  /** Why this file is relevant to the agent's goal. */
  readonly relevance: string;
}

/**
 * State captured from a departing agent during rotation.
 * Spec Section 5.4, Step 1 — capture departing agent's state.
 */
export interface IDepartingAgentState {
  /** Files the departing agent created or modified. */
  readonly modifiedFiles: readonly string[];
  /** Current progress toward the goal. */
  readonly goalProgress: string;
  /** Active peer negotiations (pending interface proposals). */
  readonly activePeerNegotiations: readonly string[];
  /** Key decisions made and their reasoning (from ESAA trail entries). */
  readonly decisions: readonly string[];
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

/**
 * A tool definition for an Anthropic API agent session.
 * Maps to the Anthropic Messages API tool schema.
 */
export interface IToolDefinition {
  /** Unique tool name. */
  readonly name: string;
  /** Human-readable description of what the tool does. */
  readonly description: string;
  /** JSON Schema for the tool's input parameters. */
  readonly input_schema: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Agent harness interface
// ---------------------------------------------------------------------------

/**
 * IAgentHarness — the subsystem that manages the full lifecycle of agent
 * sessions within the Cortex Engine.
 *
 * The harness is NOT an orchestration loop. It manages:
 * - Creating Anthropic API sessions with the right model, tools, system prompt
 * - Injecting the golden window formation sequence
 * - Monitoring token usage and signaling the Drift Detection System
 * - Capturing ESAA events from the agent's actions
 * - Handling rotation (terminating degraded session, launching replacement)
 *
 * Spec Section 3.1 — agents are autonomous API sessions.
 * Spec Section 5.4 — golden window formation and rotation.
 * Spec Section 12.4, Phase A Step 1 — the first thing to build.
 */
export interface IAgentHarness {
  /**
   * Launch a new agent session with the given configuration.
   * Returns the live session handle.
   */
  launch(config: IAgentHarnessConfig): Promise<ILiveAgentSession>;

  /**
   * Rotate an agent — terminate the departing session and return it.
   *
   * Returns the DEPARTED (terminated) session, not the replacement.
   * Rotation is intentionally two-step: the orchestrator calls rotate()
   * to terminate and capture state, then calls launch() separately
   * with a replacement config that includes the departing agent's state
   * in the golden window. This keeps the harness from needing to know
   * how to construct golden windows.
   *
   * Spec Section 5.4 — four-step rotation process.
   */
  rotate(agentId: string, reason: string): Promise<ILiveAgentSession>;

  /** Gracefully terminate an agent session (goal completed). */
  terminate(agentId: string): Promise<void>;

  /** Get a live session handle by agent ID. */
  getSession(agentId: string): ILiveAgentSession | undefined;

  /** Get all active sessions. */
  getActiveSessions(): ILiveAgentSession[];
}

/**
 * ILiveAgentSession — a running agent session with real-time monitoring.
 *
 * This extends the IAgentSession data snapshot with live operations:
 * sending messages, observing token usage, and streaming responses.
 */
export interface ILiveAgentSession {
  /** The session's immutable data snapshot. */
  readonly session: IAgentSession;

  /**
   * Send a user-turn message to the agent and receive the assistant response.
   * This is the core interaction: the caller provides a prompt (goal assignment,
   * peer message, etc.) and the agent responds autonomously.
   *
   * Returns the full assistant response including any tool use.
   */
  send(message: string): Promise<IAgentResponse>;

  /** Current token usage stats, updated after each turn. */
  readonly tokenUsage: ITokenUsage;

  /** Subscribe to events emitted by this session. */
  onEvent(handler: (event: IAgentSessionEvent) => void): void;

  /** Whether the session is still active (not terminated or rotated). */
  readonly isActive: boolean;
}

/** Token usage tracking for an agent session. */
export interface ITokenUsage {
  /** Tokens used in the current context window. */
  readonly contextTokensUsed: number;
  /** Maximum context window for this model tier. */
  readonly contextTokensMax: number;
  /** Context fill ratio (0-1). */
  readonly fillRatio: number;
  /** Total input tokens consumed across all turns. */
  readonly totalInputTokens: number;
  /** Total output tokens generated across all turns. */
  readonly totalOutputTokens: number;
  /** Number of conversation turns completed. */
  readonly turnCount: number;
}

/** A response from an agent after processing a message. */
export interface IAgentResponse {
  /** The agent's text response content. */
  readonly textContent: string;
  /** Tool use blocks from the response (if the agent used tools). */
  readonly toolUse: readonly IToolUseBlock[];
  /** Token usage for this specific turn. */
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Whether the response was truncated by stop reason. */
  readonly stopReason: string;
  /** Extended thinking content (if available). */
  readonly thinkingContent?: string;
}

/** A tool use block from an agent's response. */
export interface IToolUseBlock {
  readonly id: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
}

/** Events emitted by an agent session during its lifecycle. */
export type AgentSessionEventType =
  | "turn-complete"         // Agent completed a conversation turn
  | "tool-use"              // Agent used a tool
  | "threshold-warning"     // Context fill approaching rotation threshold
  | "threshold-critical"    // Context fill at rotation-recommended level
  | "compaction-triggered"  // Compaction API was triggered
  | "error";                // An error occurred in the session

export interface IAgentSessionEvent {
  readonly type: AgentSessionEventType;
  readonly agentId: string;
  readonly timestamp: Date;
  readonly payload: Record<string, unknown>;
}
