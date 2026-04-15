/**
 * PredictionAccuracyTracker — records confidence predictions at merge
 * submission time and correlates them with evaluator outcomes.
 *
 * This is the data collection layer for the confidence calibration system.
 * It maintains two stores:
 * - Pending predictions: awaiting evaluator outcomes
 * - Matched data points: prediction + actual score paired for calibration
 *
 * Spec Section 5.3, Signal 3 — Agentic Confidence Calibration
 * Spec Section 12.4, Step 24 — Confidence calibration integration
 */

import type {
  IConfidencePrediction,
  ICalibrationDataPoint,
  ICalibrationDataFilter,
  CalibrationDirection,
  IPredictionAccuracyTracker,
} from "@kriptik/shared-interfaces";

/**
 * Threshold for considering a prediction "calibrated" vs over/under confident.
 * |predicted - actual| < CALIBRATED_THRESHOLD → "calibrated"
 */
const CALIBRATED_THRESHOLD = 0.05;

export class PredictionAccuracyTracker implements IPredictionAccuracyTracker {
  /**
   * Pending predictions indexed by goalId for fast lookup when outcomes arrive.
   * A goalId may have multiple predictions if the goal was retried (rotation).
   * We keep the most recent prediction per goalId.
   */
  private readonly pending = new Map<string, IConfidencePrediction>();

  /** Matched data points (prediction + outcome). */
  private readonly matched: ICalibrationDataPoint[] = [];

  recordPrediction(prediction: IConfidencePrediction): void {
    // Key by "buildId:goalId" to handle same goal across different builds
    const key = `${prediction.buildId}:${prediction.goalId}`;
    this.pending.set(key, prediction);
  }

  matchOutcome(
    goalId: string,
    buildId: string,
    actualScore: number,
    mergeGatePassed: boolean,
  ): ICalibrationDataPoint | null {
    const key = `${buildId}:${goalId}`;
    const prediction = this.pending.get(key);

    if (!prediction) {
      return null;
    }

    // Remove from pending — this prediction is now matched
    this.pending.delete(key);

    const calibrationError = Math.abs(prediction.predictedQuality - actualScore);
    const direction = this.classifyDirection(
      prediction.predictedQuality,
      actualScore,
    );

    const dataPoint: ICalibrationDataPoint = {
      prediction,
      actualScore,
      mergeGatePassed,
      calibrationError,
      direction,
      matchedAt: new Date(),
    };

    this.matched.push(dataPoint);

    return dataPoint;
  }

  getUnmatchedPredictions(): readonly IConfidencePrediction[] {
    return Array.from(this.pending.values());
  }

  getDataPoints(filter?: ICalibrationDataFilter): readonly ICalibrationDataPoint[] {
    if (!filter) {
      return this.matched;
    }

    return this.matched.filter(dp => {
      if (filter.modelTier && dp.prediction.modelTier !== filter.modelTier) {
        return false;
      }
      if (filter.taskType && dp.prediction.taskType !== filter.taskType) {
        return false;
      }
      if (filter.direction && dp.direction !== filter.direction) {
        return false;
      }
      if (filter.after && dp.matchedAt < filter.after) {
        return false;
      }
      return true;
    }).slice(0, filter.limit);
  }

  getMatchedCount(): number {
    return this.matched.length;
  }

  private classifyDirection(
    predicted: number,
    actual: number,
  ): CalibrationDirection {
    const diff = predicted - actual;

    if (Math.abs(diff) < CALIBRATED_THRESHOLD) {
      return "calibrated";
    }

    return diff > 0 ? "overconfident" : "underconfident";
  }
}
