/**
 * CalibrationAwareDesignThreshold — adjusts the design quality pass/fail
 * threshold based on calibration data.
 *
 * The core logic: if the DesignQualityScorer consistently overrates
 * (gives 85 when post-delivery effectiveness is 70), the pass threshold
 * should be raised so builds don't pass with inflated scores. If the
 * scorer consistently underrates, the threshold should be lowered so
 * good designs aren't rejected.
 *
 * The adjustment is capped to prevent runaway drift — the threshold
 * can be adjusted by at most ±15 points from the user's setting.
 * This preserves user intent while accounting for systematic scorer bias.
 *
 * Decision cascade:
 * 1. Check for app-type-specific calibration data first
 * 2. Fall back to global calibration data if insufficient app-type data
 * 3. Fall back to no adjustment if insufficient global data
 *
 * Spec Section 7.4 — user-adjustable threshold.
 * Spec Section 12.4, Step 25 — threshold calibration.
 */

import type {
  ICalibrationAwareDesignThreshold,
  IThresholdAdjustment,
  IDesignScoreCalibrator,
} from "@kriptik/shared-interfaces";

/** Minimum data points for threshold adjustment. */
const MIN_DATA_POINTS = 10;

/** Maximum adjustment delta in either direction (on 0-100 scale). */
const MAX_ADJUSTMENT_DELTA = 15;

/** Minimum ECE to trigger any adjustment. */
const MIN_ECE_FOR_ADJUSTMENT = 3;

export class CalibrationAwareDesignThreshold
  implements ICalibrationAwareDesignThreshold
{
  constructor(private readonly calibrator: IDesignScoreCalibrator) {}

  computeAdjustedThreshold(
    userThreshold: number,
    appType: string,
  ): IThresholdAdjustment {
    // Try app-type-specific calibration first
    const appProfile = this.calibrator.getAppTypeProfile(appType);
    if (appProfile.totalDataPoints >= MIN_DATA_POINTS) {
      return this.buildAdjustment(
        userThreshold,
        appProfile.recommendedThresholdAdjustment,
        appProfile.curve.expectedCalibrationError,
        appProfile.curve.overratingRate,
        appProfile.curve.underratingRate,
        appType,
      );
    }

    // Fall back to global calibration
    const globalCurve = this.calibrator.getGlobalCurve();
    if (globalCurve.totalDataPoints >= MIN_DATA_POINTS) {
      // Compute global bias direction
      const nonEmptyBins = globalCurve.bins.filter((b) => b.count > 0);
      const totalCount = nonEmptyBins.reduce((sum, b) => sum + b.count, 0);
      const weightedBias =
        totalCount > 0
          ? nonEmptyBins.reduce(
              (sum, b) =>
                sum +
                ((b.meanPredicted - b.meanActual) * b.count) / totalCount,
              0,
            )
          : 0;

      const adjustmentDelta = Math.round(weightedBias * 2) / 2;

      return this.buildAdjustment(
        userThreshold,
        adjustmentDelta,
        globalCurve.expectedCalibrationError,
        globalCurve.overratingRate,
        globalCurve.underratingRate,
        null,
      );
    }

    // Insufficient data — no adjustment
    return {
      originalThreshold: userThreshold,
      adjustedThreshold: userThreshold,
      adjustmentDelta: 0,
      bias: "none",
      meanCalibrationError: 0,
      appType: null,
      reasoning:
        "Insufficient calibration data for threshold adjustment. " +
        "Using user-configured threshold as-is.",
    };
  }

  hasCalibrationData(appType?: string): boolean {
    if (appType) {
      const profile = this.calibrator.getAppTypeProfile(appType);
      return profile.totalDataPoints >= MIN_DATA_POINTS;
    }
    const globalCurve = this.calibrator.getGlobalCurve();
    return globalCurve.totalDataPoints >= MIN_DATA_POINTS;
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private buildAdjustment(
    userThreshold: number,
    rawDelta: number,
    ece: number,
    overratingRate: number,
    underratingRate: number,
    appType: string | null,
  ): IThresholdAdjustment {
    // Don't adjust if ECE is below the minimum
    if (ece < MIN_ECE_FOR_ADJUSTMENT) {
      return {
        originalThreshold: userThreshold,
        adjustedThreshold: userThreshold,
        adjustmentDelta: 0,
        bias: "none",
        meanCalibrationError: ece,
        appType,
        reasoning:
          `Scorer is well-calibrated (ECE: ${ece.toFixed(1)})` +
          (appType ? ` for ${appType} apps` : "") +
          ". No threshold adjustment needed.",
      };
    }

    // Clamp the adjustment to the maximum delta
    const clampedDelta = Math.max(
      -MAX_ADJUSTMENT_DELTA,
      Math.min(MAX_ADJUSTMENT_DELTA, rawDelta),
    );

    // Compute the adjusted threshold, clamping to 0-100
    const adjusted = Math.max(0, Math.min(100, userThreshold + clampedDelta));
    const actualDelta = Math.round((adjusted - userThreshold) * 100) / 100;

    const bias: "overrating" | "underrating" | "none" =
      actualDelta > 0 ? "overrating" : actualDelta < 0 ? "underrating" : "none";

    let reasoning: string;
    if (bias === "overrating") {
      reasoning =
        `Scorer overrates design quality` +
        (appType ? ` for ${appType} apps` : "") +
        ` (overrating rate: ${(overratingRate * 100).toFixed(0)}%, ` +
        `ECE: ${ece.toFixed(1)}). ` +
        `Raising threshold by ${actualDelta.toFixed(1)} points ` +
        `(${userThreshold} → ${adjusted}) to compensate.`;
    } else if (bias === "underrating") {
      reasoning =
        `Scorer underrates design quality` +
        (appType ? ` for ${appType} apps` : "") +
        ` (underrating rate: ${(underratingRate * 100).toFixed(0)}%, ` +
        `ECE: ${ece.toFixed(1)}). ` +
        `Lowering threshold by ${Math.abs(actualDelta).toFixed(1)} points ` +
        `(${userThreshold} → ${adjusted}) to avoid rejecting good designs.`;
    } else {
      reasoning =
        `Scorer has moderate miscalibration (ECE: ${ece.toFixed(1)})` +
        (appType ? ` for ${appType} apps` : "") +
        ` but no consistent directional bias. No threshold adjustment applied.`;
    }

    return {
      originalThreshold: userThreshold,
      adjustedThreshold: adjusted,
      adjustmentDelta: actualDelta,
      bias,
      meanCalibrationError: ece,
      appType,
      reasoning,
    };
  }
}
