/**
 * Design quality scoring calibration interfaces — the system that tracks
 * correlation between automated design quality scores and actual design
 * effectiveness outcomes, producing calibration data that adjusts thresholds
 * and scorer dimension weights over time.
 *
 * This is the design-scoring analog of the confidence calibration system
 * (Step 24). Where confidence calibration correlates agent self-assessment
 * with evaluator outcomes, design scoring calibration correlates the
 * DesignQualityScorer's automated scores with post-delivery effectiveness:
 *
 * - User satisfaction signals (explicit feedback, revision requests)
 * - Design violation rate post-delivery (issues found after build completion)
 * - Revision frequency (how often design elements get reworked)
 *
 * The calibration data feeds two adjustment mechanisms:
 * 1. Threshold adjustment — if the scorer systematically overrates, the
 *    pass threshold is raised; if it underrates, the threshold is lowered.
 * 2. Dimension weight adjustment — if certain dimensions (e.g., animation
 *    presence) don't correlate with actual satisfaction, their weight
 *    decreases; dimensions that do correlate get more weight.
 *
 * Spec Section 7.3, Layer 7 — Design quality scoring
 * Spec Section 7.4 — Design Quality as Continuous Spectrum
 * Spec Section 10.4 — The Learning Signal ("if the design quality score
 *   is consistently lower for certain app types → feedback for Design
 *   Pioneer briefing")
 * Spec Section 12.4, Step 25 — Design quality scoring calibration
 */

// ---------------------------------------------------------------------------
// Design score prediction (recorded at build completion)
// ---------------------------------------------------------------------------

/**
 * IDesignScorePrediction — the automated design quality score recorded
 * when a build completes, before any post-delivery feedback is available.
 *
 * This is the "predicted" side of the calibration equation. The "actual"
 * side comes from post-delivery outcome signals.
 *
 * Spec Section 7.3, Layer 7 — design quality scoring produces this.
 * Spec Section 7.4 — user-adjustable threshold applied to this score.
 */
export interface IDesignScorePrediction {
  /** Unique prediction ID. */
  readonly id: string;
  /** The build this score was produced for. */
  readonly buildId: string;
  /** The overall composite score (0-100). */
  readonly overallScore: number;
  /** Per-dimension scores at the time of assessment. */
  readonly dimensionScores: readonly IDesignDimensionSnapshot[];
  /** The threshold the score was measured against. */
  readonly threshold: number;
  /** Whether the score passed the threshold at assessment time. */
  readonly passed: boolean;
  /**
   * The app type / domain classification for this build.
   * Used to detect domain-specific scoring biases (spec Section 10.4).
   */
  readonly appType: string;
  /** When this prediction was recorded. */
  readonly recordedAt: Date;
}

/**
 * Snapshot of a single dimension's score at prediction time.
 * Preserved so calibration can correlate per-dimension accuracy.
 */
export interface IDesignDimensionSnapshot {
  /** The dimension ID (e.g., "quality-thresholds", "effect-presence"). */
  readonly dimensionId: string;
  /** The dimension's score at prediction time (0-100). */
  readonly score: number;
  /** The dimension's weight at prediction time (0-1). */
  readonly weight: number;
}

// ---------------------------------------------------------------------------
// Post-delivery outcome signals
// ---------------------------------------------------------------------------

/**
 * IDesignOutcomeSignal — a post-delivery feedback signal that indicates
 * actual design effectiveness.
 *
 * These signals arrive after the build is delivered to the user and
 * represent ground truth for calibrating the automated scorer.
 *
 * Spec Section 10.4 — the delta between predicted and actual is the
 * most valuable learning signal in the system.
 */
export interface IDesignOutcomeSignal {
  /** Unique signal ID. */
  readonly id: string;
  /** The build this signal applies to. */
  readonly buildId: string;
  /** The type of outcome signal. */
  readonly signalType: DesignOutcomeSignalType;
  /**
   * Quantitative value for this signal (0-1 normalized).
   * Interpretation depends on signalType:
   * - "user-satisfaction": 0 = very unsatisfied, 1 = very satisfied
   * - "revision-rate": 0 = no revisions needed, 1 = complete redesign needed
   * - "violation-rate": 0 = no violations found, 1 = pervasive violations
   * - "time-to-first-complaint": 0 = immediate complaint, 1 = no complaints
   */
  readonly value: number;
  /** Optional human-readable context for this signal. */
  readonly context: string;
  /** When this signal was recorded. */
  readonly recordedAt: Date;
}

/**
 * Types of post-delivery design outcome signals.
 *
 * Each type captures a different facet of design effectiveness:
 * - user-satisfaction: Direct user feedback on design quality
 * - revision-rate: How much rework the design needed post-delivery
 * - violation-rate: Design violations discovered after build completion
 * - time-to-first-complaint: How quickly design issues surface
 */
export type DesignOutcomeSignalType =
  | "user-satisfaction"
  | "revision-rate"
  | "violation-rate"
  | "time-to-first-complaint";

// ---------------------------------------------------------------------------
// Calibration data point (prediction matched with aggregated outcomes)
// ---------------------------------------------------------------------------

/**
 * IDesignCalibrationDataPoint — a matched pair of automated design score
 * prediction and aggregated post-delivery outcome signals.
 *
 * These are the training data for design score calibration curves.
 * Unlike confidence calibration (which has a single evaluator score),
 * design calibration aggregates multiple outcome signals into a
 * composite effectiveness score.
 *
 * Spec Section 10.4 — learning signal from prediction-vs-actual delta.
 */
export interface IDesignCalibrationDataPoint {
  /** The original design score prediction. */
  readonly prediction: IDesignScorePrediction;
  /** All outcome signals received for this build. */
  readonly outcomeSignals: readonly IDesignOutcomeSignal[];
  /**
   * Composite effectiveness score derived from outcome signals (0-100).
   * This is the ground truth against which the automated score is calibrated.
   * Computed as weighted combination of outcome signals, with revision-rate
   * and violation-rate inverted (lower is better → higher effectiveness).
   */
  readonly effectivenessScore: number;
  /**
   * Calibration error: |overallScore - effectivenessScore|.
   * Lower is better-calibrated.
   */
  readonly calibrationError: number;
  /**
   * Direction of miscalibration.
   * "overrated" = automated score > effectiveness (scorer thinks it's better than users do)
   * "underrated" = automated score < effectiveness (scorer is too harsh)
   * "calibrated" = |error| < 5 (on 0-100 scale)
   */
  readonly direction: DesignCalibrationDirection;
  /** Per-dimension calibration errors (which dimensions are most inaccurate). */
  readonly dimensionErrors: readonly IDesignDimensionCalibrationError[];
  /** When the outcome was matched to the prediction. */
  readonly matchedAt: Date;
}

/**
 * Direction of design score miscalibration.
 *
 * Note: threshold is 5 points on a 0-100 scale (equivalent to 0.05 on 0-1).
 */
export type DesignCalibrationDirection =
  | "overrated"     // automated score > effectiveness by >= 5
  | "underrated"    // automated score < effectiveness by >= 5
  | "calibrated";   // |error| < 5

/**
 * Per-dimension calibration error — identifies which scoring dimensions
 * are most and least accurate.
 *
 * Used by the feedback loop to adjust dimension weights.
 */
export interface IDesignDimensionCalibrationError {
  /** The dimension ID. */
  readonly dimensionId: string;
  /**
   * Correlation coefficient between this dimension's score and the
   * composite effectiveness score (-1 to 1).
   * Higher positive correlation = dimension predicts actual quality well.
   * Near-zero or negative = dimension doesn't predict actual quality.
   */
  readonly correlationWithEffectiveness: number;
  /** Mean absolute error for this dimension across matched data points. */
  readonly meanAbsoluteError: number;
}

// ---------------------------------------------------------------------------
// Design calibration curve
// ---------------------------------------------------------------------------

/**
 * IDesignCalibrationBin — a single bin in the design score calibration curve.
 *
 * Divides the 0-100 automated score range into bins and compares mean
 * automated score with mean effectiveness score per bin.
 */
export interface IDesignCalibrationBin {
  /** Lower bound of this bin (inclusive, 0-100). */
  readonly lower: number;
  /** Upper bound of this bin (exclusive, except for the last bin, 0-100). */
  readonly upper: number;
  /** Mean automated design quality score in this bin. */
  readonly meanPredicted: number;
  /** Mean post-delivery effectiveness score in this bin. */
  readonly meanActual: number;
  /** Number of data points in this bin. */
  readonly count: number;
  /** Bin-level calibration error: |meanPredicted - meanActual|. */
  readonly binError: number;
}

/**
 * IDesignCalibrationCurve — the full calibration curve for design
 * quality scores with aggregate metrics.
 *
 * Analogous to ICalibrationCurve from confidence calibration (Step 24)
 * but operating on the 0-100 design score scale.
 *
 * Spec Section 7.4 — calibration ensures the score reflects actual quality.
 * Spec Section 10.4 — learning signal feeds back into scoring.
 */
export interface IDesignCalibrationCurve {
  /** The bins that compose this calibration curve. */
  readonly bins: readonly IDesignCalibrationBin[];
  /**
   * Expected Calibration Error (ECE) on 0-100 scale.
   * Weighted average of bin-level errors, weighted by bin count.
   * Lower is better. 0 = perfectly calibrated.
   * < 3 = well-calibrated
   * 3-8 = moderately calibrated
   * > 8 = poorly calibrated
   */
  readonly expectedCalibrationError: number;
  /**
   * Maximum Calibration Error — worst single bin error (0-100 scale).
   */
  readonly maxCalibrationError: number;
  /**
   * Overrating rate: fraction of data points where automated > actual + 5.
   * High rates indicate the scorer is too generous.
   */
  readonly overratingRate: number;
  /**
   * Underrating rate: fraction of data points where automated < actual - 5.
   * High rates indicate the scorer is too harsh.
   */
  readonly underratingRate: number;
  /** Total data points used to compute this curve. */
  readonly totalDataPoints: number;
  /** When this curve was computed. */
  readonly computedAt: Date;
}

/**
 * DesignCalibrationQuality — assessment of how well-calibrated the
 * design quality scorer is.
 */
export type DesignCalibrationQuality =
  | "well-calibrated"      // ECE < 3 (on 0-100 scale)
  | "moderate"             // 3 <= ECE < 8
  | "poorly-calibrated";   // ECE >= 8

// ---------------------------------------------------------------------------
// App-type calibration profiles
// ---------------------------------------------------------------------------

/**
 * IAppTypeCalibrationProfile — calibration stats for a specific app type
 * (e.g., "e-commerce", "saas-dashboard", "landing-page").
 *
 * Identifies app types where the scorer systematically misrates — e.g.,
 * e-commerce apps where the scorer undervalues product imagery and
 * overvalues animation presence.
 *
 * Spec Section 10.4 — "if the design quality score is consistently lower
 * for certain app types → feedback for Design Pioneer briefing."
 */
export interface IAppTypeCalibrationProfile {
  /** The app type / domain. */
  readonly appType: string;
  /** Calibration curve for this app type. */
  readonly curve: IDesignCalibrationCurve;
  /** Calibration quality assessment. */
  readonly quality: DesignCalibrationQuality;
  /** Per-dimension correlation with effectiveness for this app type. */
  readonly dimensionCorrelations: readonly IDesignDimensionCalibrationError[];
  /** Number of matched data points. */
  readonly totalDataPoints: number;
  /**
   * Recommended threshold adjustment for this app type.
   * Positive = raise threshold (scorer overrates for this type).
   * Negative = lower threshold (scorer underrates for this type).
   * Zero = no adjustment needed.
   */
  readonly recommendedThresholdAdjustment: number;
}

// ---------------------------------------------------------------------------
// Threshold adjustment
// ---------------------------------------------------------------------------

/**
 * IThresholdAdjustment — a calibration-driven adjustment to the
 * design quality pass/fail threshold.
 *
 * Spec Section 7.4 — the threshold is user-adjustable, but calibration
 * data can recommend adjustments when the scorer is systematically biased.
 */
export interface IThresholdAdjustment {
  /** The original user-set threshold (0-100). */
  readonly originalThreshold: number;
  /** The calibration-adjusted threshold (0-100). */
  readonly adjustedThreshold: number;
  /** The adjustment delta (adjusted - original). */
  readonly adjustmentDelta: number;
  /**
   * The scoring bias that drove this adjustment.
   * "overrating" = scorer gives higher scores than reality → raise threshold
   * "underrating" = scorer gives lower scores than reality → lower threshold
   * "none" = well-calibrated, no adjustment needed
   */
  readonly bias: "overrating" | "underrating" | "none";
  /** Mean calibration error that drove the adjustment. */
  readonly meanCalibrationError: number;
  /** App type this adjustment applies to (null = global). */
  readonly appType: string | null;
  /** Human-readable reasoning. */
  readonly reasoning: string;
}

// ---------------------------------------------------------------------------
// Dimension weight adjustment
// ---------------------------------------------------------------------------

/**
 * IDimensionWeightAdjustment — calibration-driven adjustment to a
 * single scoring dimension's weight.
 *
 * Dimensions that correlate strongly with actual effectiveness get
 * more weight; dimensions that don't correlate get less weight.
 */
export interface IDimensionWeightAdjustment {
  /** The dimension ID. */
  readonly dimensionId: string;
  /** Original weight before adjustment (0-1). */
  readonly originalWeight: number;
  /** Adjusted weight after calibration (0-1). */
  readonly adjustedWeight: number;
  /** Correlation with effectiveness that drove this adjustment. */
  readonly correlationWithEffectiveness: number;
  /** Human-readable reasoning. */
  readonly reasoning: string;
}

/**
 * IDimensionWeightProfile — a complete set of calibration-adjusted
 * dimension weights.
 *
 * All adjusted weights sum to 1.0. The profile can be applied to
 * the DesignQualityScorer to improve its accuracy.
 */
export interface IDimensionWeightProfile {
  /** Individual dimension weight adjustments. */
  readonly adjustments: readonly IDimensionWeightAdjustment[];
  /** App type this profile applies to (null = global). */
  readonly appType: string | null;
  /** Number of data points this profile was computed from. */
  readonly dataPointCount: number;
  /** When this profile was computed. */
  readonly computedAt: Date;
}

// ---------------------------------------------------------------------------
// Service interfaces
// ---------------------------------------------------------------------------

/**
 * IDesignScoreAccuracyTracker — records design quality score predictions
 * at build completion and matches them with post-delivery outcome signals.
 *
 * Analogous to IPredictionAccuracyTracker from confidence calibration
 * (Step 24), but for design scores.
 *
 * Spec Section 7.3, Layer 7 — scorer produces predictions.
 * Spec Section 10.4 — outcomes arrive post-delivery.
 * Spec Section 12.4, Step 25 — design scoring calibration.
 */
export interface IDesignScoreAccuracyTracker {
  /**
   * Record a design score prediction at build completion.
   * Called by the enforcement stack after scoring.
   */
  recordPrediction(prediction: IDesignScorePrediction): void;

  /**
   * Record a post-delivery outcome signal for a build.
   * Multiple signals can be recorded per build.
   */
  recordOutcome(signal: IDesignOutcomeSignal): void;

  /**
   * Attempt to match all recorded outcome signals for a build against
   * its design score prediction. Creates a calibration data point when
   * sufficient outcome signals are available.
   *
   * @param buildId - The build to match.
   * @param minSignals - Minimum number of outcome signals required
   *                     before creating a data point (default: 2).
   * @returns The matched data point, or null if insufficient signals.
   */
  matchOutcomes(
    buildId: string,
    minSignals?: number,
  ): IDesignCalibrationDataPoint | null;

  /** Get predictions that haven't been matched with outcomes yet. */
  getUnmatchedPredictions(): readonly IDesignScorePrediction[];

  /** Get matched data points, optionally filtered. */
  getDataPoints(filter?: IDesignCalibrationDataFilter): readonly IDesignCalibrationDataPoint[];

  /** Total matched data point count. */
  getMatchedCount(): number;
}

/**
 * Filter for querying design calibration data points.
 */
export interface IDesignCalibrationDataFilter {
  /** Filter by app type. */
  readonly appType?: string;
  /** Filter by calibration direction. */
  readonly direction?: DesignCalibrationDirection;
  /** Only include data points after this date. */
  readonly after?: Date;
  /** Only include data points where automated score is within this range. */
  readonly scoreRange?: { readonly min: number; readonly max: number };
  /** Limit the number of results. */
  readonly limit?: number;
}

/**
 * IDesignScoreCalibrator — computes calibration curves from matched
 * design score prediction-outcome data.
 *
 * Analogous to IConfidenceCalibrator from Step 24, adapted for the
 * 0-100 design score scale.
 *
 * Spec Section 7.4 — design quality as continuous spectrum.
 * Spec Section 10.4 — learning signal from score-vs-effectiveness delta.
 * Spec Section 12.4, Step 25 — design scoring calibration.
 */
export interface IDesignScoreCalibrator {
  /**
   * Compute a design score calibration curve.
   *
   * @param dataPoints - Matched prediction-outcome pairs.
   * @param binCount - Number of bins (default: 10, each covering 10 points).
   */
  computeCurve(
    dataPoints: readonly IDesignCalibrationDataPoint[],
    binCount?: number,
  ): IDesignCalibrationCurve;

  /**
   * Get the calibration profile for a specific app type.
   * Identifies domain-specific scoring biases.
   */
  getAppTypeProfile(appType: string): IAppTypeCalibrationProfile;

  /**
   * Get the global (all app types) calibration curve.
   */
  getGlobalCurve(): IDesignCalibrationCurve;

  /**
   * Assess calibration quality from a curve.
   */
  assessQuality(curve: IDesignCalibrationCurve): DesignCalibrationQuality;

  /**
   * Compute per-dimension correlation with effectiveness across
   * all matched data points.
   */
  computeDimensionCorrelations(): readonly IDesignDimensionCalibrationError[];
}

/**
 * ICalibrationAwareDesignThreshold — adjusts the design quality
 * pass/fail threshold based on calibration data.
 *
 * If the scorer consistently overrates (gives 85 when effectiveness
 * is 70), the threshold should be raised so builds don't pass with
 * inflated scores. If the scorer consistently underrates, the threshold
 * should be lowered so good designs aren't rejected.
 *
 * Spec Section 7.4 — user-adjustable threshold.
 * Spec Section 12.4, Step 25 — threshold calibration.
 */
export interface ICalibrationAwareDesignThreshold {
  /**
   * Compute the calibration-adjusted threshold for a build.
   *
   * @param userThreshold - The user's configured threshold (0-100).
   * @param appType - The app type for domain-specific adjustments.
   * @returns The threshold adjustment with reasoning.
   */
  computeAdjustedThreshold(
    userThreshold: number,
    appType: string,
  ): IThresholdAdjustment;

  /**
   * Check whether there's sufficient calibration data for
   * meaningful threshold adjustment.
   *
   * @returns false if the system should use the user's raw threshold.
   */
  hasCalibrationData(appType?: string): boolean;
}

/**
 * IDesignScoringFeedbackLoop — feeds calibration data back into the
 * DesignQualityScorer's dimension weights so the scorer improves
 * over time.
 *
 * The feedback loop adjusts which dimensions matter most by correlating
 * each dimension's score with actual post-delivery effectiveness.
 * Dimensions that predict real quality well get more weight; dimensions
 * that don't predict well get less weight.
 *
 * Spec Section 10.4 — "the delta between what ICE predicted and what
 * CVS measured is the most valuable learning signal in the system."
 * Spec Section 12.4, Step 25 — design scoring feedback loop.
 */
export interface IDesignScoringFeedbackLoop {
  /**
   * Compute adjusted dimension weights based on calibration data.
   *
   * @param appType - App type for domain-specific weights (null = global).
   * @returns Weight profile, or null if insufficient data.
   */
  computeWeightAdjustments(
    appType: string | null,
  ): IDimensionWeightProfile | null;

  /**
   * Get the minimum number of data points required before the
   * feedback loop produces weight adjustments.
   */
  getMinimumDataPoints(): number;

  /**
   * Check whether the feedback loop has produced any weight adjustments.
   */
  hasAdjustments(appType?: string): boolean;
}
