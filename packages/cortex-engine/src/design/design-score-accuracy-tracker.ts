/**
 * DesignScoreAccuracyTracker — records design quality score predictions
 * at build completion and matches them with post-delivery outcome signals.
 *
 * Follows the same two-stage storage pattern as PredictionAccuracyTracker
 * (Step 24): pending predictions wait in a Map indexed by buildId until
 * outcome signals arrive, then matchOutcomes() pairs them into calibration
 * data points stored in the matched array.
 *
 * Spec Section 7.3, Layer 7 — scorer produces predictions.
 * Spec Section 10.4 — outcomes arrive post-delivery.
 * Spec Section 12.4, Step 25 — design scoring calibration.
 */

import type {
  IDesignScorePrediction,
  IDesignOutcomeSignal,
  IDesignCalibrationDataPoint,
  IDesignCalibrationDataFilter,
  IDesignScoreAccuracyTracker,
  IDesignDimensionCalibrationError,
  DesignCalibrationDirection,
} from "@kriptik/shared-interfaces";

/** Threshold for considering a score "calibrated" (on 0-100 scale). */
const CALIBRATED_THRESHOLD = 5;

/**
 * Outcome signal weights for computing composite effectiveness score.
 * Revision-rate and violation-rate are inverted (lower is better),
 * so their raw values are subtracted from 1 before weighting.
 */
const OUTCOME_WEIGHTS: Record<string, { weight: number; invert: boolean }> = {
  "user-satisfaction": { weight: 0.40, invert: false },
  "revision-rate": { weight: 0.25, invert: true },
  "violation-rate": { weight: 0.20, invert: true },
  "time-to-first-complaint": { weight: 0.15, invert: false },
};

export class DesignScoreAccuracyTracker implements IDesignScoreAccuracyTracker {
  /** Pending predictions indexed by buildId. */
  private readonly pending = new Map<string, IDesignScorePrediction>();
  /** Outcome signals indexed by buildId. */
  private readonly outcomes = new Map<string, IDesignOutcomeSignal[]>();
  /** Matched calibration data points. */
  private readonly matched: IDesignCalibrationDataPoint[] = [];

  recordPrediction(prediction: IDesignScorePrediction): void {
    this.pending.set(prediction.buildId, prediction);
  }

  recordOutcome(signal: IDesignOutcomeSignal): void {
    const existing = this.outcomes.get(signal.buildId);
    if (existing) {
      existing.push(signal);
    } else {
      this.outcomes.set(signal.buildId, [signal]);
    }
  }

  matchOutcomes(
    buildId: string,
    minSignals: number = 2,
  ): IDesignCalibrationDataPoint | null {
    const prediction = this.pending.get(buildId);
    if (!prediction) return null;

    const signals = this.outcomes.get(buildId);
    if (!signals || signals.length < minSignals) return null;

    const effectivenessScore = this.computeEffectivenessScore(signals);
    const calibrationError = Math.abs(
      prediction.overallScore - effectivenessScore,
    );
    const direction = this.classifyDirection(
      prediction.overallScore,
      effectivenessScore,
    );

    const dimensionErrors = this.computeDimensionErrors(
      prediction,
      effectivenessScore,
    );

    const dataPoint: IDesignCalibrationDataPoint = {
      prediction,
      outcomeSignals: [...signals],
      effectivenessScore,
      calibrationError,
      direction,
      dimensionErrors,
      matchedAt: new Date(),
    };

    this.matched.push(dataPoint);
    this.pending.delete(buildId);
    this.outcomes.delete(buildId);

    return dataPoint;
  }

  getUnmatchedPredictions(): readonly IDesignScorePrediction[] {
    return [...this.pending.values()];
  }

  getDataPoints(
    filter?: IDesignCalibrationDataFilter,
  ): readonly IDesignCalibrationDataPoint[] {
    if (!filter) return this.matched;

    return this.matched.filter((dp) => {
      if (
        filter.appType !== undefined &&
        dp.prediction.appType !== filter.appType
      ) {
        return false;
      }
      if (filter.direction !== undefined && dp.direction !== filter.direction) {
        return false;
      }
      if (filter.after !== undefined && dp.matchedAt < filter.after) {
        return false;
      }
      if (filter.scoreRange !== undefined) {
        if (
          dp.prediction.overallScore < filter.scoreRange.min ||
          dp.prediction.overallScore > filter.scoreRange.max
        ) {
          return false;
        }
      }
      return true;
    }).slice(0, filter.limit);
  }

  getMatchedCount(): number {
    return this.matched.length;
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  /**
   * Compute composite effectiveness score from outcome signals.
   * Normalizes to 0-100 scale.
   */
  private computeEffectivenessScore(
    signals: readonly IDesignOutcomeSignal[],
  ): number {
    let weightedSum = 0;
    let totalWeight = 0;

    for (const signal of signals) {
      const config = OUTCOME_WEIGHTS[signal.signalType];
      if (!config) continue;

      // Signals are 0-1; convert to 0-100 after optional inversion
      const normalizedValue = config.invert
        ? (1 - signal.value) * 100
        : signal.value * 100;

      weightedSum += normalizedValue * config.weight;
      totalWeight += config.weight;
    }

    if (totalWeight === 0) return 50; // Neutral default
    return Math.round((weightedSum / totalWeight) * 100) / 100;
  }

  private classifyDirection(
    predicted: number,
    actual: number,
  ): DesignCalibrationDirection {
    const delta = predicted - actual;
    if (delta >= CALIBRATED_THRESHOLD) return "overrated";
    if (delta <= -CALIBRATED_THRESHOLD) return "underrated";
    return "calibrated";
  }

  /**
   * Compute per-dimension errors. Since we don't have per-dimension
   * ground truth, we measure each dimension's deviation from the
   * overall effectiveness ratio. If effectiveness is 80% of predicted,
   * each dimension's expected value is 80% of its predicted score.
   */
  private computeDimensionErrors(
    prediction: IDesignScorePrediction,
    effectivenessScore: number,
  ): IDesignDimensionCalibrationError[] {
    if (prediction.overallScore === 0) {
      return prediction.dimensionScores.map((d) => ({
        dimensionId: d.dimensionId,
        correlationWithEffectiveness: 0,
        meanAbsoluteError: 0,
      }));
    }

    const ratio = effectivenessScore / prediction.overallScore;

    return prediction.dimensionScores.map((dim) => {
      const expectedDimScore = dim.score * ratio;
      const error = Math.abs(dim.score - expectedDimScore);

      return {
        dimensionId: dim.dimensionId,
        // Correlation estimate: closer to 1 means dimension tracks effectiveness
        // This is a rough proxy; real correlation needs multiple data points
        correlationWithEffectiveness:
          error < CALIBRATED_THRESHOLD ? 1 : Math.max(0, 1 - error / 50),
        meanAbsoluteError: Math.round(error * 100) / 100,
      };
    });
  }
}
