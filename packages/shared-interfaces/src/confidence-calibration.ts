/**
 * Confidence calibration interfaces — the system that tracks correlation
 * between agent confidence predictions and actual evaluator outcomes,
 * producing calibration curves that feed into routing decisions.
 *
 * This is the integration layer that connects:
 * - Signal 3 (Confidence Monitor from drift detection) — per-session confidence
 * - Merge gate / evaluator outcomes — actual quality measurements
 * - Routing engine — calibration-aware model tier assignment
 *
 * The core insight: agents that consistently overestimate their output quality
 * should be routed to Opus 4.6 or given additional verification, while
 * well-calibrated agents can be trusted with Sonnet routing at lower coverage.
 *
 * Spec Section 5.3, Signal 3 — Agentic Confidence Calibration (Salesforce, Jan 2026)
 * Spec Section 6.7 — Model Tier Optimization via Routing
 * Spec Section 12.4, Step 24 — Confidence calibration integration
 */

import type { ModelTier } from "./agents.js";

// ---------------------------------------------------------------------------
// Confidence prediction (recorded at merge submission time)
// ---------------------------------------------------------------------------

/**
 * IConfidencePrediction — an agent's self-assessment of its output quality,
 * recorded when it submits work to the merge gate.
 *
 * This is the "predicted" side of the calibration equation. The "actual"
 * side comes from the evaluator score after merge gate processing.
 *
 * Spec Section 5.3, Signal 3 — "Extracts process-level features across
 * an agent's trajectory — from macro dynamics (overall decision pattern)
 * to micro stability (token-level consistency)."
 */
export interface IConfidencePrediction {
  /** Unique prediction ID. */
  readonly id: string;
  /** The agent that made this prediction. */
  readonly agentId: string;
  /** The goal being submitted. */
  readonly goalId: string;
  /** The build this prediction belongs to. */
  readonly buildId: string;
  /** The task type of the goal. */
  readonly taskType: string;
  /** The model tier the agent was running on. */
  readonly modelTier: ModelTier;

  /**
   * The agent's predicted quality score for its own output (0-1).
   *
   * Derived from confidence signals in the agent's final response:
   * hedging language, qualifier frequency, self-correction patterns,
   * and explicit confidence statements.
   */
  readonly predictedQuality: number;

  /**
   * How confident the agent is in its prediction (0-1).
   * Meta-confidence: "I'm 80% sure my code is 90% quality."
   * Higher values mean the agent is more certain of its self-assessment.
   */
  readonly predictionCertainty: number;

  /** When this prediction was recorded. */
  readonly submittedAt: Date;
}

// ---------------------------------------------------------------------------
// Calibration data point (prediction matched with outcome)
// ---------------------------------------------------------------------------

/**
 * ICalibrationDataPoint — a matched pair of confidence prediction and
 * actual evaluator outcome. These are the training data for calibration curves.
 *
 * Spec Section 5.3, Signal 3 — "detect when confidence diverges from
 * actual capability."
 */
export interface ICalibrationDataPoint {
  /** The original confidence prediction. */
  readonly prediction: IConfidencePrediction;

  /**
   * Actual evaluator score from the merge gate / verification pyramid (0-1).
   * This is the ground truth against which predictions are calibrated.
   */
  readonly actualScore: number;

  /** Whether the merge gate passed on first attempt. */
  readonly mergeGatePassed: boolean;

  /**
   * Calibration error: |predictedQuality - actualScore|.
   * Lower is better-calibrated.
   */
  readonly calibrationError: number;

  /**
   * Direction of miscalibration.
   * "overconfident" = predicted > actual (agent thinks it's better than it is)
   * "underconfident" = predicted < actual (agent underestimates itself)
   * "calibrated" = |error| < 0.05
   */
  readonly direction: CalibrationDirection;

  /** When the outcome was matched to the prediction. */
  readonly matchedAt: Date;
}

/**
 * Direction of miscalibration for a single data point.
 */
export type CalibrationDirection =
  | "overconfident"    // predicted > actual by >= 0.05
  | "underconfident"   // predicted < actual by >= 0.05
  | "calibrated";      // |error| < 0.05

// ---------------------------------------------------------------------------
// Calibration curve (reliability diagram)
// ---------------------------------------------------------------------------

/**
 * ICalibrationBin — a single bin in the calibration curve.
 *
 * The calibration curve divides the 0-1 predicted confidence range into
 * bins (typically 10). For each bin, it compares the mean predicted
 * confidence with the mean actual outcome. A perfectly calibrated system
 * has mean_predicted == mean_actual for every bin.
 */
export interface ICalibrationBin {
  /** Lower bound of this bin (inclusive). */
  readonly lower: number;
  /** Upper bound of this bin (exclusive, except for the last bin). */
  readonly upper: number;
  /** Mean predicted quality for predictions in this bin. */
  readonly meanPredicted: number;
  /** Mean actual evaluator score for predictions in this bin. */
  readonly meanActual: number;
  /** Number of data points in this bin. */
  readonly count: number;
  /**
   * Bin-level calibration error: |meanPredicted - meanActual|.
   * Used to compute the weighted ECE.
   */
  readonly binError: number;
}

/**
 * ICalibrationCurve — the full calibration curve (reliability diagram)
 * with aggregate metrics.
 *
 * Spec Section 5.3, Signal 3 — confidence calibration tracks whether
 * agent confidence correlates with actual capability.
 */
export interface ICalibrationCurve {
  /** The bins that compose this calibration curve. */
  readonly bins: readonly ICalibrationBin[];

  /**
   * Expected Calibration Error (ECE) — the weighted average of
   * bin-level calibration errors, weighted by bin count.
   *
   * Lower is better. 0 = perfectly calibrated.
   * < 0.05 = well-calibrated
   * 0.05-0.15 = moderately calibrated
   * > 0.15 = poorly calibrated
   */
  readonly expectedCalibrationError: number;

  /**
   * Maximum Calibration Error (MCE) — the worst single bin error.
   * High MCE with low ECE means the system is well-calibrated on average
   * but has a problematic confidence range.
   */
  readonly maxCalibrationError: number;

  /**
   * Overconfidence rate: fraction of data points where predicted > actual + 0.05.
   * Higher rates indicate chronic overconfidence.
   */
  readonly overconfidenceRate: number;

  /**
   * Underconfidence rate: fraction of data points where predicted < actual - 0.05.
   * Underconfidence is less dangerous but wastes resources (routes to Opus unnecessarily).
   */
  readonly underconfidenceRate: number;

  /** Total number of data points used to compute this curve. */
  readonly totalDataPoints: number;

  /** When this curve was computed. */
  readonly computedAt: Date;
}

// ---------------------------------------------------------------------------
// Agent/model calibration profiles
// ---------------------------------------------------------------------------

/**
 * CalibrationQuality — assessment of how well-calibrated an agent or
 * model tier is.
 */
export type CalibrationQuality =
  | "well-calibrated"      // ECE < 0.05
  | "moderate"             // 0.05 <= ECE < 0.15
  | "poorly-calibrated";   // ECE >= 0.15

/**
 * IModelTierCalibrationProfile — aggregate calibration stats for a
 * model tier across all agents and task types.
 *
 * Used by the calibration-aware router to adjust routing decisions
 * based on how well each tier self-assesses.
 */
export interface IModelTierCalibrationProfile {
  /** The model tier. */
  readonly modelTier: ModelTier;
  /** Overall calibration curve for this tier. */
  readonly curve: ICalibrationCurve;
  /** Calibration quality assessment. */
  readonly quality: CalibrationQuality;
  /** Per-task-type calibration breakdown. */
  readonly taskTypeBreakdown: ReadonlyMap<string, ICalibrationCurve>;
  /** Number of matched data points for this tier. */
  readonly totalDataPoints: number;
}

/**
 * ITaskTypeCalibrationProfile — calibration stats for a specific task type
 * across all model tiers and agents.
 *
 * Identifies task types where agents consistently miscalibrate —
 * e.g., auth tasks where agents are overconfident because they produce
 * code that compiles but has subtle security issues.
 */
export interface ITaskTypeCalibrationProfile {
  /** The task type. */
  readonly taskType: string;
  /** Overall calibration curve for this task type. */
  readonly curve: ICalibrationCurve;
  /** Calibration quality assessment. */
  readonly quality: CalibrationQuality;
  /** Per-model-tier breakdown for this task type. */
  readonly tierBreakdown: ReadonlyMap<ModelTier, ICalibrationCurve>;
  /** Number of matched data points for this task type. */
  readonly totalDataPoints: number;
}

// ---------------------------------------------------------------------------
// Overconfidence detection
// ---------------------------------------------------------------------------

/**
 * OverconfidenceSeverity — how severe the overconfidence pattern is.
 */
export type OverconfidenceSeverity =
  | "mild"       // overconfidence rate 30-50%, occasional misjudgment
  | "moderate"   // overconfidence rate 50-70%, systematic bias
  | "severe";    // overconfidence rate >70%, agent cannot self-assess

/**
 * IOverconfidenceAlert — raised when a model tier or task type shows
 * chronic overconfidence patterns.
 *
 * Spec Section 5.3, Signal 3 — "catches the specific failure mode where
 * a degrading agent produces confident-sounding but shallow code."
 */
export interface IOverconfidenceAlert {
  /** Unique alert ID. */
  readonly id: string;

  /**
   * What scope is overconfident: a specific model tier for a task type,
   * a model tier overall, or a task type overall.
   */
  readonly scope: OverconfidenceScope;

  /** Severity of the overconfidence pattern. */
  readonly severity: OverconfidenceSeverity;

  /** The overconfidence rate that triggered this alert (0-1). */
  readonly overconfidenceRate: number;

  /** Mean calibration error for overconfident predictions. */
  readonly meanOverconfidenceError: number;

  /**
   * Recommended action based on severity.
   */
  readonly recommendation: OverconfidenceRecommendation;

  /** When this alert was raised. */
  readonly raisedAt: Date;
}

/**
 * Scope of an overconfidence alert.
 */
export type OverconfidenceScope =
  | { readonly type: "model-tier"; readonly modelTier: ModelTier }
  | { readonly type: "task-type"; readonly taskType: string }
  | { readonly type: "model-tier-task-type"; readonly modelTier: ModelTier; readonly taskType: string };

/**
 * Recommended action when overconfidence is detected.
 *
 * Spec Section 5.3 — confidence divergence feeds into rotation and
 * escalation decisions.
 * Spec Section 6.7 — routing adjusts based on accumulated quality data.
 */
export type OverconfidenceRecommendation =
  | "escalate-to-opus"             // Route this task type to Opus instead of Sonnet
  | "add-verification"             // Keep current tier but add extra verification checks
  | "lower-confidence-threshold"   // Reduce the routing confidence for this scope
  | "monitor";                     // Not severe enough for action yet, continue tracking

// ---------------------------------------------------------------------------
// Calibration-aware routing adjustment
// ---------------------------------------------------------------------------

/**
 * ICalibrationRoutingAdjustment — how calibration data modifies a
 * routing decision.
 *
 * The calibration-aware router wraps the base routing engine and applies
 * adjustments based on historical prediction accuracy. Poorly calibrated
 * model tier + task type combinations get routed to Opus or receive
 * additional verification.
 *
 * Spec Section 6.7 — routing considers quality correlation data.
 * Spec Section 3.4 — "Dynamic reassessment" includes calibration signals.
 */
export interface ICalibrationRoutingAdjustment {
  /** The goal this adjustment applies to. */
  readonly goalId: string;

  /** Whether calibration data changed the base routing decision. */
  readonly adjusted: boolean;

  /**
   * The original tier from the base routing engine (before adjustment).
   * Null if no base decision was provided.
   */
  readonly originalTier: ModelTier | null;

  /** The adjusted tier after calibration is applied. */
  readonly adjustedTier: ModelTier;

  /**
   * Verification level recommended by calibration data.
   * "standard" = normal merge gate
   * "enhanced" = merge gate + extra evaluator pass
   * "maximum" = merge gate + full verification pyramid + peer review
   */
  readonly verificationLevel: CalibrationVerificationLevel;

  /**
   * ECE for this model tier + task type combination.
   * Null if insufficient data.
   */
  readonly relevantECE: number | null;

  /**
   * Overconfidence rate for this combination.
   * Null if insufficient data.
   */
  readonly relevantOverconfidenceRate: number | null;

  /** Human-readable reasoning for the adjustment. */
  readonly reasoning: string;
}

/**
 * Verification level recommended by calibration data.
 */
export type CalibrationVerificationLevel =
  | "standard"   // Normal merge gate (5 checks)
  | "enhanced"   // Merge gate + extra evaluator scrutiny
  | "maximum";   // Full verification pyramid + peer review

// ---------------------------------------------------------------------------
// Service interfaces
// ---------------------------------------------------------------------------

/**
 * IPredictionAccuracyTracker — records confidence predictions at
 * submission time and matches them with evaluator outcomes.
 *
 * This is the data collection layer. It maintains a store of
 * unmatched predictions waiting for outcomes, and a store of
 * matched data points used for calibration curve computation.
 *
 * Spec Section 5.3, Signal 3 — prediction tracking
 * Spec Section 12.4, Step 24 — confidence calibration integration
 */
export interface IPredictionAccuracyTracker {
  /**
   * Record a confidence prediction when an agent submits work.
   * Called by the merge gate submission path.
   */
  recordPrediction(prediction: IConfidencePrediction): void;

  /**
   * Match an outcome to a previously recorded prediction.
   * Called after merge gate processing with the evaluator score.
   *
   * @returns The matched data point, or null if no prediction found for this goal.
   */
  matchOutcome(
    goalId: string,
    buildId: string,
    actualScore: number,
    mergeGatePassed: boolean,
  ): ICalibrationDataPoint | null;

  /**
   * Get all predictions that haven't been matched with outcomes yet.
   * Useful for diagnostics — a growing unmatched count may indicate
   * that outcomes aren't being recorded.
   */
  getUnmatchedPredictions(): readonly IConfidencePrediction[];

  /**
   * Get matched data points, optionally filtered.
   */
  getDataPoints(filter?: ICalibrationDataFilter): readonly ICalibrationDataPoint[];

  /**
   * Get the total count of matched data points.
   */
  getMatchedCount(): number;
}

/**
 * Filter for querying calibration data points.
 */
export interface ICalibrationDataFilter {
  /** Filter by model tier. */
  readonly modelTier?: ModelTier;
  /** Filter by task type. */
  readonly taskType?: string;
  /** Filter by calibration direction. */
  readonly direction?: CalibrationDirection;
  /** Only include data points after this date. */
  readonly after?: Date;
  /** Limit the number of results. */
  readonly limit?: number;
}

/**
 * IConfidenceCalibrator — computes calibration curves from matched
 * prediction-outcome data.
 *
 * This is the analysis layer. It takes the matched data from the
 * PredictionAccuracyTracker and produces calibration curves, ECE
 * scores, and per-scope profiles.
 *
 * Spec Section 5.3, Signal 3 — calibration curve computation
 * Spec Section 12.4, Step 24 — confidence calibration integration
 */
export interface IConfidenceCalibrator {
  /**
   * Compute a calibration curve from a set of data points.
   *
   * @param dataPoints — matched prediction-outcome pairs
   * @param binCount — number of bins (default: 10)
   */
  computeCurve(
    dataPoints: readonly ICalibrationDataPoint[],
    binCount?: number,
  ): ICalibrationCurve;

  /**
   * Get the calibration profile for a specific model tier.
   * Aggregates all data points for that tier across builds and task types.
   */
  getModelTierProfile(modelTier: ModelTier): IModelTierCalibrationProfile;

  /**
   * Get the calibration profile for a specific task type.
   * Aggregates all data points for that task type across tiers.
   */
  getTaskTypeProfile(taskType: string): ITaskTypeCalibrationProfile;

  /**
   * Get the calibration curve for a specific model tier + task type pair.
   * Returns null if insufficient data (< 10 data points).
   */
  getScopedCurve(modelTier: ModelTier, taskType: string): ICalibrationCurve | null;

  /**
   * Assess calibration quality from a curve.
   */
  assessQuality(curve: ICalibrationCurve): CalibrationQuality;
}

/**
 * IOverconfidenceDetector — identifies chronic overconfidence patterns
 * across model tiers and task types.
 *
 * Generates alerts when overconfidence rates exceed thresholds,
 * recommending routing adjustments or additional verification.
 *
 * Spec Section 5.3, Signal 3 — "catches the specific failure mode
 * where a degrading agent produces confident-sounding but shallow code."
 * Spec Section 12.4, Step 24 — overconfidence detection
 */
export interface IOverconfidenceDetector {
  /**
   * Scan all calibration profiles for overconfidence patterns.
   * Returns alerts for any scope where overconfidence exceeds thresholds.
   */
  scan(): readonly IOverconfidenceAlert[];

  /**
   * Check a specific model tier for overconfidence.
   * Returns an alert if overconfidence is detected, null otherwise.
   */
  checkModelTier(modelTier: ModelTier): IOverconfidenceAlert | null;

  /**
   * Check a specific task type for overconfidence.
   */
  checkTaskType(taskType: string): IOverconfidenceAlert | null;

  /**
   * Check a specific model tier + task type combination.
   */
  checkScope(modelTier: ModelTier, taskType: string): IOverconfidenceAlert | null;

  /**
   * Get all currently active overconfidence alerts.
   */
  getActiveAlerts(): readonly IOverconfidenceAlert[];
}

/**
 * ICalibrationAwareRouter — extends the base routing engine with
 * calibration-informed adjustments.
 *
 * Wraps the standard routing decision (coverage density + complexity +
 * routing phase) with calibration data. When a model tier is poorly
 * calibrated for a task type, the router escalates to Opus or increases
 * verification requirements.
 *
 * Spec Section 6.7 — routing trajectory optimization
 * Spec Section 3.4 — dynamic reassessment with calibration signals
 * Spec Section 12.4, Step 24 — calibration-aware routing
 */
export interface ICalibrationAwareRouter {
  /**
   * Compute the calibration adjustment for a routing decision.
   *
   * Takes a goal's routing context and returns any adjustment the
   * calibration system recommends on top of the base routing decision.
   *
   * @param goalId — the goal being routed
   * @param taskType — task type classification
   * @param baseTier — the tier assigned by the base routing engine
   */
  computeAdjustment(
    goalId: string,
    taskType: string,
    baseTier: ModelTier,
  ): ICalibrationRoutingAdjustment;

  /**
   * Check whether a model tier + task type pair has sufficient
   * calibration data for meaningful adjustment.
   *
   * Returns false if the system should rely on base routing alone.
   */
  hasCalibrationData(modelTier: ModelTier, taskType: string): boolean;
}
