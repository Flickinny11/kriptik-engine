/**
 * DesignScoringFeedbackLoop — feeds calibration data back into the
 * DesignQualityScorer's dimension weights so the scorer improves
 * over time.
 *
 * The feedback loop adjusts which dimensions matter most by correlating
 * each dimension's score with actual post-delivery effectiveness.
 * Dimensions with high positive correlation (their score predicts real
 * quality well) get more weight. Dimensions with low or negative
 * correlation get less weight.
 *
 * Weight redistribution is conservative:
 * - No dimension's weight drops below 5% (avoids silencing any signal)
 * - No dimension's weight exceeds 50% (avoids over-concentration)
 * - All weights sum to 1.0
 * - Adjustments are damped by 50% to prevent oscillation
 *
 * Spec Section 10.4 — "the delta between what ICE predicted and what
 * CVS measured is the most valuable learning signal in the system."
 * Spec Section 12.4, Step 25 — design scoring feedback loop.
 */

import type {
  IDimensionWeightAdjustment,
  IDimensionWeightProfile,
  IDesignScoringFeedbackLoop,
  IDesignScoreCalibrator,
  IDesignScoreAccuracyTracker,
} from "@kriptik/shared-interfaces";

/** Minimum data points before producing weight adjustments. */
const MIN_DATA_POINTS = 15;

/** Minimum weight for any dimension (prevents silencing). */
const MIN_WEIGHT = 0.05;

/** Maximum weight for any dimension (prevents over-concentration). */
const MAX_WEIGHT = 0.50;

/** Damping factor to prevent oscillation (0-1, lower = more conservative). */
const DAMPING_FACTOR = 0.50;

/** Default dimension weights (from DesignQualityScorer). */
const DEFAULT_WEIGHTS: Record<string, number> = {
  "quality-thresholds": 0.30,
  "required-patterns": 0.25,
  "token-usage": 0.20,
  "effect-presence": 0.15,
  "component-adoption": 0.10,
};

export class DesignScoringFeedbackLoop implements IDesignScoringFeedbackLoop {
  constructor(
    private readonly calibrator: IDesignScoreCalibrator,
    private readonly tracker: IDesignScoreAccuracyTracker,
  ) {}

  computeWeightAdjustments(
    appType: string | null,
  ): IDimensionWeightProfile | null {
    const dataPoints = appType
      ? this.tracker.getDataPoints({ appType })
      : this.tracker.getDataPoints();

    if (dataPoints.length < MIN_DATA_POINTS) return null;

    // Get dimension correlations with effectiveness
    const correlations = appType
      ? this.calibrator.getAppTypeProfile(appType).dimensionCorrelations
      : this.calibrator.computeDimensionCorrelations();

    if (correlations.length === 0) return null;

    // Build a map of correlations
    const correlationMap = new Map(
      correlations.map((c) => [c.dimensionId, c.correlationWithEffectiveness]),
    );

    // Compute raw weight adjustments based on correlation
    const adjustments: IDimensionWeightAdjustment[] = [];
    const rawWeights = new Map<string, number>();

    for (const [dimId, defaultWeight] of Object.entries(DEFAULT_WEIGHTS)) {
      const correlation = correlationMap.get(dimId) ?? 0;

      // Higher positive correlation → more weight
      // Correlation range is -1 to 1; map to weight multiplier
      // correlation 1.0 → multiplier 1.5 (50% more weight)
      // correlation 0.0 → multiplier 1.0 (no change)
      // correlation -1.0 → multiplier 0.5 (50% less weight)
      const multiplier = 1 + (correlation * 0.5);

      // Apply multiplier with damping
      const rawNewWeight =
        defaultWeight + (defaultWeight * multiplier - defaultWeight) * DAMPING_FACTOR;

      rawWeights.set(dimId, rawNewWeight);
    }

    // Normalize weights to sum to 1.0, respecting min/max bounds
    const normalizedWeights = this.normalizeWeights(rawWeights);

    for (const [dimId, defaultWeight] of Object.entries(DEFAULT_WEIGHTS)) {
      const adjustedWeight = normalizedWeights.get(dimId) ?? defaultWeight;
      const correlation = correlationMap.get(dimId) ?? 0;

      let reasoning: string;
      if (adjustedWeight > defaultWeight + 0.01) {
        reasoning =
          `Dimension "${dimId}" has positive correlation (${correlation.toFixed(2)}) ` +
          `with post-delivery effectiveness. Increasing weight from ` +
          `${defaultWeight.toFixed(2)} to ${adjustedWeight.toFixed(2)}.`;
      } else if (adjustedWeight < defaultWeight - 0.01) {
        reasoning =
          `Dimension "${dimId}" has weak/negative correlation (${correlation.toFixed(2)}) ` +
          `with post-delivery effectiveness. Decreasing weight from ` +
          `${defaultWeight.toFixed(2)} to ${adjustedWeight.toFixed(2)}.`;
      } else {
        reasoning =
          `Dimension "${dimId}" correlation (${correlation.toFixed(2)}) ` +
          `supports current weight. No significant adjustment.`;
      }

      adjustments.push({
        dimensionId: dimId,
        originalWeight: defaultWeight,
        adjustedWeight: Math.round(adjustedWeight * 1000) / 1000,
        correlationWithEffectiveness: correlation,
        reasoning,
      });
    }

    return {
      adjustments,
      appType,
      dataPointCount: dataPoints.length,
      computedAt: new Date(),
    };
  }

  getMinimumDataPoints(): number {
    return MIN_DATA_POINTS;
  }

  hasAdjustments(appType?: string): boolean {
    const dataPoints = appType
      ? this.tracker.getDataPoints({ appType })
      : this.tracker.getDataPoints();
    return dataPoints.length >= MIN_DATA_POINTS;
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  /**
   * Normalize weights so they sum to 1.0 while respecting min/max bounds.
   *
   * Uses iterative clamping: clamp any out-of-bounds weights, then
   * redistribute the surplus/deficit among unclamped weights.
   */
  private normalizeWeights(raw: Map<string, number>): Map<string, number> {
    const result = new Map(raw);

    // Iterative clamping (converges in 2-3 iterations)
    for (let iteration = 0; iteration < 5; iteration++) {
      const total = [...result.values()].reduce((a, b) => a + b, 0);
      if (total === 0) return new Map([...raw.keys()].map((k) => [k, 1 / raw.size]));

      // Normalize to sum to 1.0
      for (const [key, value] of result) {
        result.set(key, value / total);
      }

      // Clamp and track excess
      let excess = 0;
      let unclampedCount = 0;

      for (const [key, value] of result) {
        if (value < MIN_WEIGHT) {
          excess += MIN_WEIGHT - value;
          result.set(key, MIN_WEIGHT);
        } else if (value > MAX_WEIGHT) {
          excess -= value - MAX_WEIGHT;
          result.set(key, MAX_WEIGHT);
        } else {
          unclampedCount++;
        }
      }

      // If no excess to redistribute, we're done
      if (Math.abs(excess) < 0.001) break;

      // Redistribute excess among unclamped weights
      if (unclampedCount > 0) {
        const perUnclamped = excess / unclampedCount;
        for (const [key, value] of result) {
          if (value > MIN_WEIGHT && value < MAX_WEIGHT) {
            result.set(key, value - perUnclamped);
          }
        }
      }
    }

    return result;
  }
}
