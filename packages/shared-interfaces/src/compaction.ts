/**
 * Compaction API integration interfaces — managing context window compression,
 * anchored state tracking, and post-compaction re-injection.
 *
 * Spec Section 5.2 — Golden Window Management:
 *   Mechanism 1: Anthropic Compaction API with custom build-context summarization
 *   Mechanism 2: Factory.ai-Style Anchored State Preservation
 *   Mechanism 3: Goal Re-Injection Hooks
 *
 * The Compaction API (`compact-2026-01-12`) automatically summarizes older
 * conversation segments when approaching configurable token thresholds,
 * achieving 6x compression (150K -> 25K tokens). Cortex uses custom
 * summarization instructions optimized for build context and re-injects
 * critical state after every compaction event.
 */

import type { IAnchoredState, IESAAEvent } from "./state.js";
import type { IGoldenWindowSequence, IAgentHarnessConfig } from "./agents.js";

// ---------------------------------------------------------------------------
// Compaction configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for the Compaction API integration.
 *
 * Spec Section 5.2, Mechanism 1 — custom summarization instructions tell the
 * Compaction API what to preserve and what to discard during compression.
 */
export interface ICompactionConfig {
  /**
   * Context fill ratio at which compaction is triggered.
   * Default: 0.35 (trigger before the 0.4 warning threshold).
   *
   * Compaction should fire BEFORE rotation thresholds — it's the first
   * line of defense. If compaction keeps the window manageable, rotation
   * is unnecessary.
   */
  readonly compactionThreshold: number;

  /**
   * Custom summarization instructions sent to the Compaction API.
   * These tell the model what to preserve during compression.
   *
   * Spec Section 5.2, Mechanism 1:
   * "Cortex uses custom summarization instructions optimized for build context."
   */
  readonly summarizationInstructions: string;

  /**
   * Whether to pause after compaction to allow context injection.
   * When true, the Compaction API returns control before the agent's
   * next turn, allowing Cortex to inject the anchored state document
   * and re-injection hooks.
   *
   * Spec Section 5.2: "The `pause_after_compaction` parameter enables
   * context injection after compression."
   */
  readonly pauseAfterCompaction: boolean;

  /**
   * Maximum number of compactions allowed per agent session before
   * rotation is forced. Repeated compactions degrade quality even
   * with re-injection — at some point, a fresh context is better.
   */
  readonly maxCompactionsBeforeRotation: number;
}

// ---------------------------------------------------------------------------
// Compaction result
// ---------------------------------------------------------------------------

/**
 * Result of a compaction operation performed on an agent session.
 *
 * Spec Section 5.2, Mechanism 1 — "achieving 6x compression (150K -> 25K tokens)."
 */
export interface ICompactionResult {
  /** The agent session ID that was compacted. */
  readonly agentId: string;
  /** Build ID the agent belongs to. */
  readonly buildId: string;
  /** Context tokens used before compaction. */
  readonly tokensBefore: number;
  /** Context tokens used after compaction. */
  readonly tokensAfter: number;
  /** Compression ratio achieved (tokensBefore / tokensAfter). */
  readonly compressionRatio: number;
  /** How many times this session has been compacted (including this one). */
  readonly compactionCount: number;
  /** Whether re-injection was performed after compaction. */
  readonly reinjectionPerformed: boolean;
  /** When the compaction occurred. */
  readonly timestamp: Date;
}

// ---------------------------------------------------------------------------
// Anchored state tracker
// ---------------------------------------------------------------------------

/**
 * IAnchoredStateTracker — maintains the four-field anchored state document
 * for each agent session, incrementally merging new information from ESAA events.
 *
 * Spec Section 5.2, Mechanism 2 — Factory.ai-Style Anchored State Preservation:
 * "Rather than regenerating summaries from scratch, the Build State Manager
 * incrementally merges new information into a persistent four-field state document."
 *
 * The anchored state is maintained OUTSIDE the agent's context (in this tracker)
 * and injected after every compaction event.
 */
export interface IAnchoredStateTracker {
  /**
   * Initialize tracking for a new agent session.
   * Sets the initial intent from the goal assignment.
   */
  initializeForAgent(
    agentId: string,
    buildId: string,
    initialIntent: string,
  ): void;

  /**
   * Process an ESAA event and incrementally update the anchored state.
   * Decision events update the "decisions" field, goal-progress events
   * update "changes" and "next steps", etc.
   */
  processEvent(event: IESAAEvent): void;

  /**
   * Get the current anchored state for an agent.
   * Returns null if no state is tracked for this agent.
   */
  getState(agentId: string): IAnchoredState | null;

  /**
   * Explicitly update a specific field of the anchored state.
   * Used when the orchestrator has higher-level context (e.g., a peer
   * merge changes what the agent's next steps should be).
   */
  updateField(
    agentId: string,
    field: keyof IAnchoredState,
    value: string,
  ): void;

  /**
   * Remove tracking for an agent session (after termination or rotation).
   */
  removeAgent(agentId: string): void;
}

// ---------------------------------------------------------------------------
// Compaction manager
// ---------------------------------------------------------------------------

/**
 * ICompactionManager — monitors agent sessions and orchestrates the
 * compaction lifecycle: trigger, compress, re-inject, track.
 *
 * Spec Section 5.2, Mechanisms 1-3 combined:
 * 1. Monitors context fill and triggers the Compaction API
 * 2. Maintains anchored state via the IAnchoredStateTracker
 * 3. Performs post-compaction re-injection of operating rules and state
 *
 * The manager integrates with the agent harness and golden window builder
 * to perform the full compaction cycle without the agent losing its
 * cognitive state.
 */
export interface ICompactionManager {
  /**
   * Register an agent session for compaction monitoring.
   * Called by the orchestrator when a new agent is launched.
   */
  registerAgent(
    agentId: string,
    buildId: string,
    config: ICompactionConfig,
    harnessConfig: IAgentHarnessConfig,
  ): void;

  /**
   * Check whether an agent session needs compaction based on its
   * current context fill ratio and compaction configuration.
   *
   * Returns true if the session should be compacted now.
   */
  shouldCompact(agentId: string, currentFillRatio: number): boolean;

  /**
   * Perform compaction on an agent session.
   *
   * This is the full cycle:
   * 1. Call the Compaction API with custom summarization instructions
   * 2. Wait for compression to complete
   * 3. Update the token monitor with post-compaction token count
   * 4. Re-inject the anchored state document and operating rules
   * 5. Emit a compaction-triggered ESAA event
   *
   * Returns the compaction result with before/after metrics.
   */
  compact(agentId: string): Promise<ICompactionResult>;

  /**
   * Check whether an agent should be rotated instead of compacted.
   * Returns true if the agent has exceeded maxCompactionsBeforeRotation
   * or if compaction would not provide sufficient headroom.
   */
  shouldForceRotation(agentId: string): boolean;

  /**
   * Process an ESAA event for anchored state tracking.
   * Delegates to the internal IAnchoredStateTracker.
   */
  processEvent(event: IESAAEvent): void;

  /**
   * Get the current anchored state for an agent.
   * Returns null if no state is tracked.
   */
  getAnchoredState(agentId: string): IAnchoredState | null;

  /**
   * Unregister an agent (after termination or rotation).
   */
  unregisterAgent(agentId: string): void;

  /**
   * Get the compaction history for a build.
   */
  getCompactionHistory(buildId: string): readonly ICompactionResult[];
}
