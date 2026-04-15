/**
 * Multi-signal drift detection interfaces — the four signal categories
 * that compose the Drift Detection System.
 *
 * Signal 1: Agent Stability Index (ASI) — 12 dimensions, 4 categories
 * Signal 2: Goal Drift Index (GDI) — semantic/lexical/structural/distributional
 * Signal 3: Confidence Calibration — process-level features
 * Signal 4: Observable Behavioral Heuristics — five production-ready signals
 *
 * Spec Section 5.3 — Drift Detection: The Multi-Signal Monitoring System
 * Spec Section 5.6 — What Replaces "JEPA Predictor" and Why
 */

import type { IDriftSignal, DriftSeverity } from "./drift.js";
import type { IAgentResponse } from "./agents.js";

// ===========================================================================
// Signal 1: Agent Stability Index (ASI)
// ===========================================================================

/**
 * The four ASI measurement categories.
 * Each category has weighted contribution to the composite ASI score.
 *
 * Spec Section 5.3, Signal 1 — ASI framework (arXiv:2601.04170, Jan 2026)
 */
export type ASICategoryId =
  | "response-consistency"      // 30% weight
  | "tool-usage-patterns"       // 25% weight
  | "inter-agent-coordination"  // 25% weight
  | "behavioral-boundaries";    // 20% weight

/**
 * IASIDimension — a single ASI measurement dimension.
 *
 * The 12 dimensions span 4 categories. Each dimension produces a score
 * from 0-1 (where 1 is perfectly stable/healthy).
 *
 * Spec Section 5.3, Signal 1 — 12 dimensions across four categories.
 */
export interface IASIDimension {
  /** Dimension identifier (e.g., "semantic-similarity", "tool-selection-stability"). */
  readonly id: string;
  /** Human-readable label. */
  readonly label: string;
  /** Which category this dimension belongs to. */
  readonly category: ASICategoryId;
  /** Current score (0-1, where 1 is healthy). */
  readonly score: number;
  /** Score trend over the last 3 evaluation windows (for flagging rule). */
  readonly recentScores: readonly number[];
}

/**
 * IASICategory — aggregated score for one ASI category.
 *
 * Spec Section 5.3, Signal 1:
 * - Response Consistency (30%) — semantic similarity, decision pathway stability, confidence calibration
 * - Tool Usage Patterns (25%) — selection stability, sequencing consistency, parameterization drift
 * - Inter-Agent Coordination (25%) — consensus agreement quality, handoff efficiency
 * - Behavioral Boundaries (20%) — output length stability, error patterns, intervention rate
 */
export interface IASICategory {
  /** Category identifier. */
  readonly id: ASICategoryId;
  /** Human-readable label. */
  readonly label: string;
  /** Weight in the composite score (sums to 1.0 across all categories). */
  readonly weight: number;
  /** Average score across dimensions in this category (0-1). */
  readonly score: number;
  /** Individual dimension scores. */
  readonly dimensions: readonly IASIDimension[];
}

/**
 * IASIResult — complete Agent Stability Index evaluation.
 *
 * Drift is flagged when the composite score drops below 0.75 for
 * three consecutive evaluation windows.
 *
 * Spec Section 5.3, Signal 1 — "Drift is flagged when the composite
 * score drops below 0.75 for three consecutive evaluation windows."
 */
export interface IASIResult {
  /** The agent being evaluated. */
  readonly agentId: string;
  /** Composite ASI score (0-1, weighted average of categories). */
  readonly compositeScore: number;
  /** Per-category breakdown. */
  readonly categories: readonly IASICategory[];
  /** Whether the 3-consecutive-windows flagging rule is triggered. */
  readonly isFlagged: boolean;
  /** Number of consecutive windows below threshold (0-N). */
  readonly consecutiveWindowsBelowThreshold: number;
  /** When this evaluation was computed. */
  readonly evaluatedAt: Date;
}

/**
 * IASIMonitor — computes the Agent Stability Index for an agent session.
 *
 * Takes agent response data as input and produces a composite ASI score
 * with per-dimension and per-category breakdown. Maintains sliding window
 * history for the 3-consecutive-windows flagging rule.
 *
 * Spec Section 5.3, Signal 1 — ASI framework (arXiv:2601.04170)
 */
export interface IASIMonitor {
  /** Register an agent for ASI monitoring. */
  registerAgent(agentId: string): void;

  /**
   * Evaluate an agent's stability after a response.
   * Updates internal window history and returns the current ASI result.
   */
  evaluate(agentId: string, response: IAgentResponse): IASIResult;

  /** Get the latest ASI result for an agent. */
  getLatestResult(agentId: string): IASIResult | null;

  /** Convert an ASI result to a drift signal (for the threshold monitor). */
  toDriftSignal(result: IASIResult, buildId: string): IDriftSignal | null;

  /** Unregister an agent when its session ends. */
  unregisterAgent(agentId: string): void;
}

// ===========================================================================
// Signal 2: Goal Drift Index (GDI)
// ===========================================================================

/**
 * The four GDI divergence measures.
 *
 * Spec Section 5.3, Signal 2 — SAHOO framework (March 6, 2026):
 * "A learned multi-signal detector combining semantic, lexical, structural,
 * and distributional measures."
 */
export type GDIDivergenceType =
  | "semantic"          // Output meaning drifting from goal intent
  | "lexical"           // Vocabulary/terminology divergence
  | "structural"        // Code structure divergence from expected patterns
  | "distributional";   // Statistical distribution shift in output characteristics

/**
 * IGDIDivergence — a single divergence measurement.
 *
 * Each divergence type produces a score from 0-1 (where 0 is perfectly
 * aligned and 1 is maximally divergent).
 */
export interface IGDIDivergence {
  /** Which divergence type. */
  readonly type: GDIDivergenceType;
  /** Divergence score (0-1, where 0 is aligned). */
  readonly score: number;
  /** Description of what divergence was detected. */
  readonly description: string;
}

/**
 * IGDIResult — complete Goal Drift Index evaluation.
 *
 * Detects when an agent's output is semantically drifting from its
 * assigned goal — producing code that technically works but doesn't
 * serve the intended purpose.
 *
 * Spec Section 5.3, Signal 2 — "Achieves 18.3% improvement in code tasks
 * and 16.8% in reasoning while preserving alignment constraints."
 */
export interface IGDIResult {
  /** The agent being evaluated. */
  readonly agentId: string;
  /** The goal being measured against. */
  readonly goalId: string;
  /** Composite GDI score (0-1, where 0 is aligned, 1 is maximally drifted). */
  readonly compositeScore: number;
  /** Per-divergence-type breakdown. */
  readonly divergences: readonly IGDIDivergence[];
  /** Whether goal drift has been detected (composite above threshold). */
  readonly isDrifting: boolean;
  /** When this evaluation was computed. */
  readonly evaluatedAt: Date;
}

/**
 * IGDIMonitor — computes the Goal Drift Index for an agent session.
 *
 * Compares agent output against the assigned goal description, spec
 * sections, and blueprint to detect semantic, lexical, structural,
 * and distributional divergence.
 *
 * Spec Section 5.3, Signal 2 — SAHOO framework
 */
export interface IGDIMonitor {
  /** Register an agent and its goal for GDI monitoring. */
  registerAgent(agentId: string, goalDescription: string): void;

  /**
   * Evaluate goal drift after an agent response.
   * Compares the response content against the registered goal.
   */
  evaluate(agentId: string, response: IAgentResponse): IGDIResult;

  /** Get the latest GDI result for an agent. */
  getLatestResult(agentId: string): IGDIResult | null;

  /** Convert a GDI result to a drift signal (for the threshold monitor). */
  toDriftSignal(result: IGDIResult, buildId: string): IDriftSignal | null;

  /** Unregister an agent when its session ends. */
  unregisterAgent(agentId: string): void;
}

// ===========================================================================
// Signal 3: Confidence Calibration
// ===========================================================================

/**
 * Confidence calibration feature levels — from macro dynamics
 * to micro stability.
 *
 * Spec Section 5.3, Signal 3 — "Extracts process-level features across
 * an agent's trajectory — from macro dynamics (overall decision pattern)
 * to micro stability (token-level consistency)."
 */
export type ConfidenceFeatureLevel = "macro" | "micro";

/**
 * IConfidenceFeature — a single confidence calibration measurement.
 *
 * Features span from macro (overall decision patterns) to micro
 * (token-level consistency). Divergence between confidence and
 * actual capability indicates degradation.
 */
export interface IConfidenceFeature {
  /** Feature identifier (e.g., "decision-reversals", "hedging-frequency"). */
  readonly id: string;
  /** Human-readable label. */
  readonly label: string;
  /** Macro or micro level. */
  readonly level: ConfidenceFeatureLevel;
  /** Current value (0-1, interpretation depends on the feature). */
  readonly value: number;
  /** Baseline value for this agent (from early session). */
  readonly baseline: number;
  /** Deviation from baseline (absolute difference). */
  readonly deviation: number;
}

/**
 * IConfidenceCalibrationResult — confidence calibration evaluation.
 *
 * Catches the specific failure mode where a degrading agent produces
 * confident-sounding but shallow code.
 *
 * Spec Section 5.3, Signal 3 — Agentic Confidence Calibration
 * (Salesforce, Jan 2026): "detect when confidence diverges from
 * actual capability."
 */
export interface IConfidenceCalibrationResult {
  /** The agent being evaluated. */
  readonly agentId: string;
  /** Overall calibration score (0-1, where 1 is well-calibrated). */
  readonly calibrationScore: number;
  /** Individual feature measurements. */
  readonly features: readonly IConfidenceFeature[];
  /** Whether confidence has diverged from capability. */
  readonly isDivergent: boolean;
  /** Description of the divergence pattern (if any). */
  readonly divergenceDescription: string | null;
  /** When this evaluation was computed. */
  readonly evaluatedAt: Date;
}

/**
 * IConfidenceMonitor — computes confidence calibration for an agent.
 *
 * Extracts process-level features from agent responses and compares
 * them against the agent's own baseline from early in the session.
 *
 * Spec Section 5.3, Signal 3 — Agentic Confidence Calibration
 */
export interface IConfidenceMonitor {
  /** Register an agent for confidence monitoring. */
  registerAgent(agentId: string): void;

  /**
   * Evaluate confidence calibration after an agent response.
   * Builds baseline from early responses and detects deviation.
   */
  evaluate(agentId: string, response: IAgentResponse): IConfidenceCalibrationResult;

  /** Get the latest result for an agent. */
  getLatestResult(agentId: string): IConfidenceCalibrationResult | null;

  /** Convert a calibration result to a drift signal. */
  toDriftSignal(
    result: IConfidenceCalibrationResult,
    buildId: string,
  ): IDriftSignal | null;

  /** Unregister an agent when its session ends. */
  unregisterAgent(agentId: string): void;
}

// ===========================================================================
// Signal 4: Observable Behavioral Heuristics
// ===========================================================================

/**
 * The five behavioral heuristic dimensions from the spec.
 *
 * Spec Section 5.3, Signal 4 — Observable behavior signals:
 * - context-fill-trajectory: how fast the agent is consuming context
 * - error-handling-coverage: is thoroughness declining?
 * - trail-reference-frequency: is the agent still drawing on injected trails?
 * - peer-interaction-quality: terse, unconsidered responses to peer proposals?
 * - sub-agent-spawning: healthy spawning vs. stopping or over-spawning?
 */
export type BehavioralHeuristicId =
  | "context-fill-trajectory"
  | "error-handling-coverage"
  | "trail-reference-frequency"
  | "peer-interaction-quality"
  | "sub-agent-spawning";

/**
 * IBehavioralHeuristic — a single behavioral heuristic measurement.
 */
export interface IBehavioralHeuristic {
  /** Which heuristic. */
  readonly id: BehavioralHeuristicId;
  /** Human-readable label. */
  readonly label: string;
  /** Health score (0-1, where 1 is healthy behavior). */
  readonly score: number;
  /** Description of the observed behavior. */
  readonly description: string;
}

/**
 * IBehavioralHeuristicsResult — complete behavioral heuristics evaluation.
 *
 * Spec Section 5.3, Signal 4 — "Production-ready today."
 */
export interface IBehavioralHeuristicsResult {
  /** The agent being evaluated. */
  readonly agentId: string;
  /** Composite behavioral health score (0-1, average of heuristics). */
  readonly compositeScore: number;
  /** Per-heuristic breakdown. */
  readonly heuristics: readonly IBehavioralHeuristic[];
  /** Severity assessment. */
  readonly severity: DriftSeverity;
  /** When this evaluation was computed. */
  readonly evaluatedAt: Date;
}

/**
 * IBehavioralMonitor — computes behavioral heuristics for an agent.
 *
 * Extends the basic context-fill tracking from Phase B Step 9 with
 * the full five-heuristic set from the spec.
 *
 * Spec Section 5.3, Signal 4 — Observable Behavioral Heuristics
 */
export interface IBehavioralMonitor {
  /** Register an agent for behavioral monitoring. */
  registerAgent(agentId: string): void;

  /**
   * Record a behavioral observation.
   * Called after each agent response with context about what happened.
   */
  recordObservation(agentId: string, observation: IBehavioralObservation): void;

  /**
   * Evaluate all behavioral heuristics for an agent.
   * Uses accumulated observations to compute per-heuristic scores.
   */
  evaluate(agentId: string): IBehavioralHeuristicsResult;

  /** Get the latest result for an agent. */
  getLatestResult(agentId: string): IBehavioralHeuristicsResult | null;

  /** Convert a behavioral result to a drift signal. */
  toDriftSignal(
    result: IBehavioralHeuristicsResult,
    buildId: string,
  ): IDriftSignal | null;

  /** Unregister an agent when its session ends. */
  unregisterAgent(agentId: string): void;
}

/**
 * IBehavioralObservation — a single behavioral data point recorded
 * after an agent response.
 *
 * The monitor accumulates these and computes heuristic scores from
 * the aggregate patterns.
 */
export interface IBehavioralObservation {
  /** Tokens consumed by this response (for context fill trajectory). */
  readonly tokensConsumed: number;
  /** Current context fill ratio after this response. */
  readonly contextFillRatio: number;
  /** Whether the response included error handling code. */
  readonly hasErrorHandling: boolean;
  /** Number of trail references in the response. */
  readonly trailReferences: number;
  /** Whether this was a response to a peer message. */
  readonly isPeerResponse: boolean;
  /** Quality assessment of peer response (if applicable, 0-1). */
  readonly peerResponseQuality: number | null;
  /** Number of sub-agents spawned in this turn. */
  readonly subAgentsSpawned: number;
  /** When this observation was recorded. */
  readonly observedAt: Date;
}

// ===========================================================================
// Multi-Signal Drift Monitor (Composite)
// ===========================================================================

/**
 * IMultiSignalDriftMonitor — the composite monitor that combines all four
 * signal categories into unified drift assessment.
 *
 * This is the top-level drift detection interface. It coordinates the four
 * individual monitors (ASI, GDI, Confidence, Behavioral) and produces
 * IDriftSignal instances that feed the EnhancedThresholdMonitor for
 * cost-benefit rotation decisions.
 *
 * Spec Section 5.3 — "The Drift Detection System combines four signal
 * categories."
 * Spec Section 5.6 — replaces the JEPA predictor with proven technology.
 */
export interface IMultiSignalDriftMonitor {
  /** Register an agent for multi-signal monitoring. */
  registerAgent(agentId: string, goalDescription: string): void;

  /**
   * Process an agent response through all four signal monitors.
   * Returns any drift signals that were produced (may be empty if healthy).
   */
  processResponse(
    agentId: string,
    buildId: string,
    response: IAgentResponse,
    observation: IBehavioralObservation,
  ): readonly IDriftSignal[];

  /** Get the latest results from all four monitors for an agent. */
  getLatestResults(agentId: string): IMultiSignalSnapshot | null;

  /** Unregister an agent when its session ends. */
  unregisterAgent(agentId: string): void;
}

/**
 * IMultiSignalSnapshot — a point-in-time snapshot of all four signal
 * monitors for an agent.
 *
 * Provides the orchestrator with a complete picture of an agent's
 * cognitive health across all signal dimensions.
 */
export interface IMultiSignalSnapshot {
  /** The agent being monitored. */
  readonly agentId: string;
  /** Signal 1: ASI result (null if not enough data yet). */
  readonly asi: IASIResult | null;
  /** Signal 2: GDI result (null if not enough data yet). */
  readonly gdi: IGDIResult | null;
  /** Signal 3: Confidence calibration (null if not enough data yet). */
  readonly confidence: IConfidenceCalibrationResult | null;
  /** Signal 4: Behavioral heuristics (null if not enough data yet). */
  readonly behavioral: IBehavioralHeuristicsResult | null;
  /** Overall health assessment (0-1, worst of all signals). */
  readonly overallHealth: number;
  /** When this snapshot was taken. */
  readonly snapshotAt: Date;
}
