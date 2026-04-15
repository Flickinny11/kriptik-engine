/**
 * ConfidenceCalibrator — computes calibration curves (reliability diagrams)
 * from matched prediction-outcome data.
 *
 * The calibration curve answers: "When agents predict 80% quality, do
 * they actually achieve 80% quality?" A perfectly calibrated system has
 * mean_predicted == mean_actual for every confidence bin.
 *
 * Key metrics:
 * - ECE (Expected Calibration Error): weighted average bin error. Lower = better.
 * - MCE (Maximum Calibration Error): worst single bin. Finds trouble spots.
 * - Overconfidence rate: how often agents overestimate themselves.
 *
 * Spec Section 5.3, Signal 3 — Agentic Confidence Calibration
 * Spec Section 12.4, Step 24 — Confidence calibration integration
 */

import type {
  ModelTier,
  ICalibrationDataPoint,
  ICalibrationBin,
  ICalibrationCurve,
  IModelTierCalibrationProfile,
  ITaskTypeCalibrationProfile,
  CalibrationQuality,
  IConfidenceCalibrator,
  IPredictionAccuracyTracker,
} from "@kriptik/shared-interfaces";

/** Default number of bins in the calibration curve. */
const DEFAULT_BIN_COUNT = 10;

/** Minimum data points required for a meaningful calibration curve. */
const MIN_DATA_POINTS = 10;

/** ECE thresholds for quality assessment. */
const ECE_WELL_CALIBRATED = 0.05;
const ECE_MODERATE = 0.15;

/** Threshold for counting a prediction as overconfident. */
const OVERCONFIDENCE_THRESHOLD = 0.05;

export class ConfidenceCalibrator implements IConfidenceCalibrator {
  constructor(
    private readonly tracker: IPredictionAccuracyTracker,
  ) {}

  computeCurve(
    dataPoints: readonly ICalibrationDataPoint[],
    binCount: number = DEFAULT_BIN_COUNT,
  ): ICalibrationCurve {
    if (dataPoints.length === 0) {
      return this.emptyCurve(binCount);
    }

    const bins = this.buildBins(dataPoints, binCount);
    const totalCount = dataPoints.length;

    // ECE: weighted average of bin errors, weighted by bin count / total count
    const expectedCalibrationError = bins.reduce(
      (sum, bin) => sum + (bin.count / totalCount) * bin.binError,
      0,
    );

    const maxCalibrationError = Math.max(...bins.map(b => b.binError));

    // Overconfidence: predicted > actual + threshold
    const overconfidentCount = dataPoints.filter(
      dp => dp.prediction.predictedQuality > dp.actualScore + OVERCONFIDENCE_THRESHOLD,
    ).length;

    // Underconfidence: predicted < actual - threshold
    const underconfidentCount = dataPoints.filter(
      dp => dp.prediction.predictedQuality < dp.actualScore - OVERCONFIDENCE_THRESHOLD,
    ).length;

    return {
      bins,
      expectedCalibrationError,
      maxCalibrationError,
      overconfidenceRate: overconfidentCount / totalCount,
      underconfidenceRate: underconfidentCount / totalCount,
      totalDataPoints: totalCount,
      computedAt: new Date(),
    };
  }

  getModelTierProfile(modelTier: ModelTier): IModelTierCalibrationProfile {
    const allPoints = this.tracker.getDataPoints({ modelTier });
    const curve = this.computeCurve(allPoints);
    const quality = this.assessQuality(curve);

    // Per-task-type breakdown
    const taskTypeMap = new Map<string, ICalibrationDataPoint[]>();
    for (const dp of allPoints) {
      const existing = taskTypeMap.get(dp.prediction.taskType) ?? [];
      existing.push(dp);
      taskTypeMap.set(dp.prediction.taskType, existing);
    }

    const taskTypeBreakdown = new Map<string, ICalibrationCurve>();
    for (const [taskType, points] of taskTypeMap) {
      if (points.length >= MIN_DATA_POINTS) {
        taskTypeBreakdown.set(taskType, this.computeCurve(points));
      }
    }

    return {
      modelTier,
      curve,
      quality,
      taskTypeBreakdown,
      totalDataPoints: allPoints.length,
    };
  }

  getTaskTypeProfile(taskType: string): ITaskTypeCalibrationProfile {
    const allPoints = this.tracker.getDataPoints({ taskType });
    const curve = this.computeCurve(allPoints);
    const quality = this.assessQuality(curve);

    // Per-model-tier breakdown
    const tierMap = new Map<ModelTier, ICalibrationDataPoint[]>();
    for (const dp of allPoints) {
      const existing = tierMap.get(dp.prediction.modelTier) ?? [];
      existing.push(dp);
      tierMap.set(dp.prediction.modelTier, existing);
    }

    const tierBreakdown = new Map<ModelTier, ICalibrationCurve>();
    for (const [tier, points] of tierMap) {
      if (points.length >= MIN_DATA_POINTS) {
        tierBreakdown.set(tier, this.computeCurve(points));
      }
    }

    return {
      taskType,
      curve,
      quality,
      tierBreakdown,
      totalDataPoints: allPoints.length,
    };
  }

  getScopedCurve(modelTier: ModelTier, taskType: string): ICalibrationCurve | null {
    const points = this.tracker.getDataPoints({ modelTier, taskType });

    if (points.length < MIN_DATA_POINTS) {
      return null;
    }

    return this.computeCurve(points);
  }

  assessQuality(curve: ICalibrationCurve): CalibrationQuality {
    if (curve.totalDataPoints < MIN_DATA_POINTS) {
      return "moderate"; // Insufficient data defaults to moderate caution
    }

    if (curve.expectedCalibrationError < ECE_WELL_CALIBRATED) {
      return "well-calibrated";
    }

    if (curve.expectedCalibrationError < ECE_MODERATE) {
      return "moderate";
    }

    return "poorly-calibrated";
  }

  private buildBins(
    dataPoints: readonly ICalibrationDataPoint[],
    binCount: number,
  ): readonly ICalibrationBin[] {
    const binWidth = 1.0 / binCount;
    const bins: ICalibrationBin[] = [];

    for (let i = 0; i < binCount; i++) {
      const lower = i * binWidth;
      const upper = (i + 1) * binWidth;

      // Points in this bin: predicted quality falls within [lower, upper)
      // (last bin is [lower, upper] inclusive on both ends)
      const binPoints = dataPoints.filter(dp => {
        const predicted = dp.prediction.predictedQuality;
        if (i === binCount - 1) {
          return predicted >= lower && predicted <= upper;
        }
        return predicted >= lower && predicted < upper;
      });

      if (binPoints.length === 0) {
        bins.push({
          lower,
          upper,
          meanPredicted: (lower + upper) / 2,
          meanActual: (lower + upper) / 2, // No data — assume calibrated
          count: 0,
          binError: 0,
        });
        continue;
      }

      const meanPredicted =
        binPoints.reduce((sum, dp) => sum + dp.prediction.predictedQuality, 0) /
        binPoints.length;

      const meanActual =
        binPoints.reduce((sum, dp) => sum + dp.actualScore, 0) /
        binPoints.length;

      bins.push({
        lower,
        upper,
        meanPredicted,
        meanActual,
        count: binPoints.length,
        binError: Math.abs(meanPredicted - meanActual),
      });
    }

    return bins;
  }

  private emptyCurve(binCount: number): ICalibrationCurve {
    const binWidth = 1.0 / binCount;
    const bins: ICalibrationBin[] = [];

    for (let i = 0; i < binCount; i++) {
      const lower = i * binWidth;
      const upper = (i + 1) * binWidth;
      bins.push({
        lower,
        upper,
        meanPredicted: (lower + upper) / 2,
        meanActual: (lower + upper) / 2,
        count: 0,
        binError: 0,
      });
    }

    return {
      bins,
      expectedCalibrationError: 0,
      maxCalibrationError: 0,
      overconfidenceRate: 0,
      underconfidenceRate: 0,
      totalDataPoints: 0,
      computedAt: new Date(),
    };
  }
}
