/**
 * Drift detection and prevention interfaces — the multi-signal monitoring
 * system that keeps agents operating at peak cognitive quality.
 *
 * Spec Section 5.1 — The Hard Threshold (40-50% context fill)
 * Spec Section 5.3 — Drift Detection: The Multi-Signal Monitoring System
 * Spec Section 5.4 — Agent Rotation and Warm-Up Sequences
 */

// ---------------------------------------------------------------------------
// Drift signals
// ---------------------------------------------------------------------------

/**
 * The four signal categories that compose the drift detection system.
 * Spec Section 5.3 — each category contributes to a composite assessment.
 */
export type DriftSignalSource =
  | "asi"              // Signal 1 — Agent Stability Index (12 dimensions, 4 categories)
  | "gdi"              // Signal 2 — Goal Drift Index (semantic/lexical/structural/distributional)
  | "confidence"       // Signal 3 — Confidence Calibration (process-level features)
  | "behavioral";      // Signal 4 — Observable behavioral heuristics

/** Severity of a drift signal. */
export type DriftSeverity = "nominal" | "warning" | "critical";

/**
 * IDriftSignal — what the monitoring system produces.
 *
 * The Drift Detection System combines four signal categories to detect
 * when an agent is degrading. It does NOT directly trigger rotation —
 * it feeds a cost-benefit calculation.
 *
 * Spec Section 5.3 — "The monitoring system doesn't trigger a rotation
 * when degradation is detected. It calculates the cost of rotating vs.
 * the cost of continuing."
 */
export interface IDriftSignal {
  /** Unique signal identifier. */
  readonly id: string;
  /** The build this signal pertains to. */
  readonly buildId: string;
  /** The agent session being monitored. */
  readonly agentId: string;
  /** Which signal source detected this. */
  readonly source: DriftSignalSource;
  /** Severity assessment. */
  readonly severity: DriftSeverity;

  /**
   * Composite score from the source (0-1, where 1 is healthy).
   * For ASI: drops below 0.75 for 3 consecutive windows = flagged.
   * Spec Section 5.3, Signal 1.
   */
  readonly score: number;

  /** Human-readable description of what was detected. */
  readonly description: string;
  /** When this signal was emitted. */
  readonly detectedAt: Date;
}

// ---------------------------------------------------------------------------
// Rotation decisions
// ---------------------------------------------------------------------------

/**
 * The five possible rotation recommendations.
 * Spec Section 5.3 — "The Rotation Decision: Cost-Benefit, Not Threshold."
 */
export type RotationRecommendation =
  | "rotate-now"               // Start complex work degraded costs more than rotation
  | "let-finish"               // Nearly done; rework risk is low
  | "rotate-at-breakpoint"     // Rotate between work units
  | "investigate"              // Unusual early signals — may need model tier escalation
  | "stagger"                  // Multiple peers approaching degradation simultaneously
  | "none";                    // Agent is healthy, no action needed

/**
 * A rotation decision produced by the monitoring system.
 * Combines drift signals with cost-benefit analysis.
 */
export interface IRotationDecision {
  /** The agent session this decision is about. */
  readonly agentId: string;
  /** Recommendation. */
  readonly recommendation: RotationRecommendation;
  /** The drift signals that informed this decision. */
  readonly signals: readonly IDriftSignal[];
  /** Estimated cost of rotating now (in tokens/time). */
  readonly rotationCost: number;
  /** Estimated cost of continuing without rotation. */
  readonly continuationRisk: number;
  /** When this decision was computed. */
  readonly computedAt: Date;
}
