/**
 * Rotation protocol and enhanced threshold monitoring interfaces.
 *
 * The rotation system bridges token threshold monitoring (Section 5.1),
 * drift detection (Section 5.3), and agent lifecycle management (Section 5.4)
 * into a unified protocol for maintaining agent cognitive quality.
 *
 * Spec Section 5.3 — Drift Detection: The Multi-Signal Monitoring System
 * Spec Section 5.4 — Agent Rotation and Warm-Up Sequences
 */

import type { IDriftSignal, IRotationDecision } from "./drift.js";
import type { IDepartingAgentState, ModelTier } from "./agents.js";

// ---------------------------------------------------------------------------
// Rotation context
// ---------------------------------------------------------------------------

/**
 * Context needed for the cost-benefit rotation calculation.
 *
 * Spec Section 5.3 — "The monitoring system doesn't trigger a rotation when
 * degradation is detected. It calculates the cost of rotating vs. the cost
 * of continuing."
 */
export interface IRotationContext {
  /** How far the agent is toward completing its current goal (0-1). */
  readonly goalProgress: number;
  /** Estimated tokens of remaining work for the current goal. */
  readonly estimatedRemainingWork: number;
  /** Complexity of the agent's upcoming work. */
  readonly upcomingWorkComplexity: "low" | "medium" | "high";
  /** Number of peer agents also approaching degradation thresholds. */
  readonly peersApproachingDegradation: number;
  /** Current model tier of the agent being evaluated. */
  readonly currentModelTier: ModelTier;
}

// ---------------------------------------------------------------------------
// Enhanced threshold monitoring
// ---------------------------------------------------------------------------

/**
 * IEnhancedThresholdMonitor — combines token fill thresholds with drift
 * signals to produce cost-benefit rotation decisions.
 *
 * The basic TokenMonitor (Phase A, Step 1) only tracks context fill ratio
 * and emits warning/critical events at 40%/50%. This enhanced monitor
 * integrates those token signals with drift signals from Signal 4
 * (behavioral heuristics) and, in future phases, Signals 1-3 (ASI, GDI,
 * Confidence Calibration).
 *
 * Spec Section 5.3 — four signal categories composing drift detection.
 * Spec Section 5.3 — "The Rotation Decision: Cost-Benefit, Not Threshold."
 */
export interface IEnhancedThresholdMonitor {
  /** Register an agent session for multi-signal monitoring. */
  registerAgent(agentId: string, buildId: string): void;

  /**
   * Process a token threshold crossing from the base TokenMonitor.
   * Called when TokenMonitor emits threshold-warning or threshold-critical.
   */
  processTokenThreshold(
    agentId: string,
    fillRatio: number,
    severity: "warning" | "critical",
  ): void;

  /** Process a drift signal from the Drift Detection System. */
  processDriftSignal(signal: IDriftSignal): void;

  /**
   * Evaluate whether an agent should be rotated using cost-benefit analysis.
   *
   * The five possible recommendations from spec Section 5.3:
   * - rotate-now: Starting complex work degraded costs more than rotation
   * - let-finish: Nearly done; rework risk is low for short remaining duration
   * - rotate-at-breakpoint: Natural pause between work units
   * - investigate: Unusual early signals — may need model tier escalation
   * - stagger: Multiple peers approaching degradation simultaneously
   */
  evaluateRotation(
    agentId: string,
    context: IRotationContext,
  ): IRotationDecision;

  /** Get all active drift signals for an agent. */
  getActiveSignals(agentId: string): readonly IDriftSignal[];

  /** Unregister an agent when its session ends. */
  unregisterAgent(agentId: string): void;
}

// ---------------------------------------------------------------------------
// State capture
// ---------------------------------------------------------------------------

/**
 * IStateCaptureProvider — extracts the departing agent's state for handoff.
 *
 * Implementations gather state from multiple sources:
 * - Git: which files the agent modified
 * - Build State Tracker: current goal progress
 * - Graph-Mesh: active peer negotiations
 * - ESAA Event Log: decisions made and reasoning
 *
 * Spec Section 5.4, Step 1 — "Capture the departing agent's state."
 */
export interface IStateCaptureProvider {
  /** Capture the departing agent's complete state for handoff to replacement. */
  captureState(
    agentId: string,
    buildId: string,
  ): Promise<IDepartingAgentState>;
}

// ---------------------------------------------------------------------------
// Rotation result and outcome tracking
// ---------------------------------------------------------------------------

/**
 * IRotationResult — the output of a rotation execution.
 * Contains the captured state and metadata the orchestrator needs to
 * construct the replacement agent's golden window and launch it.
 *
 * Spec Section 5.4, Steps 1-2 — capture state, prepare for replacement.
 */
export interface IRotationResult {
  /** Unique identifier for this rotation event. */
  readonly rotationId: string;
  /** ID of the agent that was rotated out. */
  readonly departedAgentId: string;
  /** Captured state from the departing agent for golden window injection. */
  readonly capturedState: IDepartingAgentState;
  /** The rotation decision that triggered this rotation. */
  readonly decision: IRotationDecision;
  /** When the rotation was executed. */
  readonly rotatedAt: Date;
}

/**
 * IRotationOutcome — post-rotation performance assessment.
 *
 * Recorded after the replacement agent has processed ~5,000 tokens
 * to evaluate the quality of the warm-up sequence and handoff.
 * This data improves future warm-up sequences.
 *
 * Spec Section 5.4, Step 4 — "Record the rotation outcome. After 5,000
 * tokens, evaluate: did it enter golden window? Did it need to redo
 * any work? How long was the transition? Was the warm-up sequence optimal?"
 */
export interface IRotationOutcome {
  /** The rotation this outcome assesses. */
  readonly rotationId: string;
  /** ID of the replacement agent that was launched. */
  readonly replacementAgentId: string;
  /** Whether the replacement entered golden window successfully. */
  readonly enteredGoldenWindow: boolean;
  /** Whether the replacement had to redo any of the departed agent's work. */
  readonly redidWork: boolean;
  /** Tokens consumed during the transition/warm-up phase. */
  readonly transitionTokens: number;
  /** Overall warm-up quality assessment (0-1). */
  readonly warmUpQuality: number;
}

// ---------------------------------------------------------------------------
// Rotation protocol
// ---------------------------------------------------------------------------

/**
 * IRotationProtocol — orchestrates the complete rotation lifecycle.
 *
 * The protocol bridges threshold monitoring (when to rotate), state capture
 * (what to preserve), and agent harness (how to terminate), returning
 * everything the orchestrator needs to launch the replacement.
 *
 * The protocol does NOT launch the replacement agent — the orchestrator
 * constructs the golden window with the captured state and calls
 * AgentHarness.launch(). This separation keeps golden window construction
 * logic in the orchestrator where it has access to the full build context
 * (blueprint, trails, code, etc.).
 *
 * Spec Section 5.4 — the four-step rotation process:
 * 1. Capture the departing agent's state
 * 2. Construct the golden window formation sequence for the replacement
 * 3. Launch the replacement via a new Anthropic API session
 * 4. Record the rotation outcome
 *
 * This protocol handles steps 1 and 4. Steps 2-3 are the orchestrator's
 * responsibility (with the harness handling step 3's API session creation).
 */
export interface IRotationProtocol {
  /**
   * Execute a rotation: capture departing state → terminate session →
   * return rotation result with everything needed for replacement launch.
   */
  executeRotation(
    agentId: string,
    decision: IRotationDecision,
  ): Promise<IRotationResult>;

  /**
   * Record the outcome of a rotation after the replacement has stabilized.
   * Called by the orchestrator after ~5,000 tokens of replacement activity.
   */
  recordOutcome(outcome: IRotationOutcome): void;

  /** Get rotation history for a build (for trail extraction and diagnostics). */
  getRotationHistory(buildId: string): readonly IRotationResult[];
}
