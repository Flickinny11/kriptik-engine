/**
 * DesignScoreCalibrator — computes calibration curves from matched
 * design score prediction-outcome data.
 *
 * Follows the same binning approach as ConfidenceCalibrator (Step 24)
 * but operates on the 0-100 design score scale rather than 0-1.
 * Divides the score range into bins, computes mean predicted vs mean
 * actual per bin, and produces ECE/MCE metrics.
 *
 * Also computes per-dimension correlation with effectiveness to
 * identify which scoring dimensions predict real quality and which don't.
 *
 * Spec Section 7.4 — design quality as continuous spectrum.
 * Spec Section 10.4 — learning signal from score-vs-effectiveness delta.
 * Spec Section 12.4, Step 25 — design scoring calibration.
 */

import type {
  IDesignCalibrationDataPoint,
  IDesignCalibrationBin,
  IDesignCalibrationCurve,
  IDesignScoreCalibrator,
  IAppTypeCalibrationProfile,
  IDesignDimensionCalibrationError,
  DesignCalibrationQuality,
  IDesignScoreAccuracyTracker,
} from "@kriptik/shared-interfaces";

/** Minimum data points for a meaningful calibration curve. */
const MIN_DATA_POINTS = 10;

/** ECE thresholds for quality assessment (on 0-100 scale). */
const WELL_CALIBRATED_THRESHOLD = 3;
const MODERATE_THRESHOLD = 8;

/** Threshold for "calibrated" direction classification. */
const DIRECTION_THRESHOLD = 5;

export class DesignScoreCalibrator implements IDesignScoreCalibrator {
  constructor(
    private readonly tracker: IDesignScoreAccuracyTracker,
  ) {}

  computeCurve(
    dataPoints: readonly IDesignCalibrationDataPoint[],
    binCount: number = 10,
  ): IDesignCalibrationCurve {
    const binWidth = 100 / binCount;
    const bins: IDesignCalibrationBin[] = [];

    for (let i = 0; i < binCount; i++) {
      const lower = i * binWidth;
      const upper = (i + 1) * binWidth;

      const binPoints = dataPoints.filter((dp) => {
        const score = dp.prediction.overallScore;
        return i === binCount - 1
          ? score >= lower && score <= upper
          : score >= lower && score < upper;
      });

      if (binPoints.length === 0) {
        bins.push({
          lower,
          upper,
          meanPredicted: (lower + upper) / 2,
          meanActual: (lower + upper) / 2,
          count: 0,
          binError: 0,
        });
        continue;
      }

      const meanPredicted =
        binPoints.reduce((sum, dp) => sum + dp.prediction.overallScore, 0) /
        binPoints.length;
      const meanActual =
        binPoints.reduce((sum, dp) => sum + dp.effectivenessScore, 0) /
        binPoints.length;

      bins.push({
        lower,
        upper,
        meanPredicted: Math.round(meanPredicted * 100) / 100,
        meanActual: Math.round(meanActual * 100) / 100,
        count: binPoints.length,
        binError:
          Math.round(Math.abs(meanPredicted - meanActual) * 100) / 100,
      });
    }

    // ECE: weighted average of bin errors
    const totalPoints = dataPoints.length;
    const ece =
      totalPoints > 0
        ? bins.reduce(
            (sum, bin) => sum + (bin.count / totalPoints) * bin.binError,
            0,
          )
        : 0;

    // MCE: maximum bin error (among non-empty bins)
    const nonEmptyBins = bins.filter((b) => b.count > 0);
    const mce =
      nonEmptyBins.length > 0
        ? Math.max(...nonEmptyBins.map((b) => b.binError))
        : 0;

    // Overrating/underrating rates
    const overrated = dataPoints.filter(
      (dp) =>
        dp.prediction.overallScore - dp.effectivenessScore >=
        DIRECTION_THRESHOLD,
    ).length;
    const underrated = dataPoints.filter(
      (dp) =>
        dp.effectivenessScore - dp.prediction.overallScore >=
        DIRECTION_THRESHOLD,
    ).length;

    return {
      bins,
      expectedCalibrationError: Math.round(ece * 100) / 100,
      maxCalibrationError: Math.round(mce * 100) / 100,
      overratingRate: totalPoints > 0 ? overrated / totalPoints : 0,
      underratingRate: totalPoints > 0 ? underrated / totalPoints : 0,
      totalDataPoints: totalPoints,
      computedAt: new Date(),
    };
  }

  getAppTypeProfile(appType: string): IAppTypeCalibrationProfile {
    const dataPoints = this.tracker.getDataPoints({ appType });
    const curve = this.computeCurve(dataPoints);
    const quality = this.assessQuality(curve);
    const dimensionCorrelations =
      this.computeDimensionCorrelationsFromPoints(dataPoints);

    // Compute threshold adjustment recommendation
    const recommendedThresholdAdjustment =
      this.computeThresholdAdjustment(curve);

    return {
      appType,
      curve,
      quality,
      dimensionCorrelations,
      totalDataPoints: dataPoints.length,
      recommendedThresholdAdjustment,
    };
  }

  getGlobalCurve(): IDesignCalibrationCurve {
    const dataPoints = this.tracker.getDataPoints();
    return this.computeCurve(dataPoints);
  }

  assessQuality(curve: IDesignCalibrationCurve): DesignCalibrationQuality {
    if (curve.totalDataPoints < MIN_DATA_POINTS) return "moderate";
    if (curve.expectedCalibrationError < WELL_CALIBRATED_THRESHOLD) {
      return "well-calibrated";
    }
    if (curve.expectedCalibrationError < MODERATE_THRESHOLD) {
      return "moderate";
    }
    return "poorly-calibrated";
  }

  computeDimensionCorrelations(): readonly IDesignDimensionCalibrationError[] {
    const dataPoints = this.tracker.getDataPoints();
    return this.computeDimensionCorrelationsFromPoints(dataPoints);
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  /**
   * Compute Pearson correlation coefficient between each dimension's
   * score and the composite effectiveness score across data points.
   */
  private computeDimensionCorrelationsFromPoints(
    dataPoints: readonly IDesignCalibrationDataPoint[],
  ): IDesignDimensionCalibrationError[] {
    if (dataPoints.length < 3) return [];

    // Collect all unique dimension IDs
    const dimensionIds = new Set<string>();
    for (const dp of dataPoints) {
      for (const dim of dp.prediction.dimensionScores) {
        dimensionIds.add(dim.dimensionId);
      }
    }

    const results: IDesignDimensionCalibrationError[] = [];

    for (const dimId of dimensionIds) {
      // Extract paired (dimensionScore, effectivenessScore) for this dimension
      const pairs: { dim: number; eff: number }[] = [];
      for (const dp of dataPoints) {
        const dimSnapshot = dp.prediction.dimensionScores.find(
          (d) => d.dimensionId === dimId,
        );
        if (dimSnapshot) {
          pairs.push({
            dim: dimSnapshot.score,
            eff: dp.effectivenessScore,
          });
        }
      }

      if (pairs.length < 3) {
        results.push({
          dimensionId: dimId,
          correlationWithEffectiveness: 0,
          meanAbsoluteError: 0,
        });
        continue;
      }

      const correlation = this.pearsonCorrelation(
        pairs.map((p) => p.dim),
        pairs.map((p) => p.eff),
      );

      const mae =
        pairs.reduce((sum, p) => sum + Math.abs(p.dim - p.eff), 0) /
        pairs.length;

      results.push({
        dimensionId: dimId,
        correlationWithEffectiveness: Math.round(correlation * 1000) / 1000,
        meanAbsoluteError: Math.round(mae * 100) / 100,
      });
    }

    return results;
  }

  /**
   * Pearson correlation coefficient between two arrays.
   * Returns a value between -1 and 1.
   */
  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n === 0) return 0;

    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denomX = 0;
    let denomY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      numerator += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }

    const denominator = Math.sqrt(denomX * denomY);
    if (denominator === 0) return 0;

    return numerator / denominator;
  }

  /**
   * Compute a threshold adjustment recommendation from a calibration curve.
   *
   * If the scorer overrates (mean predicted > mean actual), recommend
   * raising the threshold by the ECE amount. If it underrates, recommend
   * lowering.
   */
  private computeThresholdAdjustment(curve: IDesignCalibrationCurve): number {
    if (curve.totalDataPoints < MIN_DATA_POINTS) return 0;

    // Compute overall bias direction from non-empty bins
    const nonEmptyBins = curve.bins.filter((b) => b.count > 0);
    if (nonEmptyBins.length === 0) return 0;

    const totalCount = nonEmptyBins.reduce((sum, b) => sum + b.count, 0);
    const weightedBias = nonEmptyBins.reduce(
      (sum, b) => sum + ((b.meanPredicted - b.meanActual) * b.count) / totalCount,
      0,
    );

    // Round to nearest 0.5 for clean threshold adjustments
    return Math.round(weightedBias * 2) / 2;
  }
}
