/**
 * CalibrationAwareRouter — extends the base routing engine with
 * calibration-informed adjustments.
 *
 * When the base routing engine routes a goal to Sonnet but the
 * calibration data shows that Sonnet is chronically overconfident
 * for that task type, this router escalates to Opus or increases
 * the verification level.
 *
 * The adjustment logic:
 * 1. Look up the calibration curve for (baseTier, taskType)
 * 2. If insufficient data → no adjustment (trust base routing)
 * 3. If well-calibrated → no tier change, standard verification
 * 4. If moderate miscalibration → keep tier, enhance verification
 * 5. If poorly calibrated + overconfident Sonnet → escalate to Opus
 * 6. If poorly calibrated + overconfident Opus → maximum verification
 *
 * Spec Section 6.7 — routing considers quality correlation data
 * Spec Section 3.4 — dynamic reassessment includes calibration signals
 * Spec Section 12.4, Step 24 — calibration-aware routing
 */

import type {
  ModelTier,
  ICalibrationRoutingAdjustment,
  CalibrationVerificationLevel,
  ICalibrationAwareRouter,
  IConfidenceCalibrator,
  IOverconfidenceDetector,
  ICalibrationCurve,
  CalibrationQuality,
} from "@kriptik/shared-interfaces";

/**
 * ECE threshold above which Sonnet routing gets escalated to Opus
 * (only when also overconfident).
 */
const ESCALATION_ECE_THRESHOLD = 0.15;

/**
 * Overconfidence rate above which verification is enhanced regardless
 * of ECE.
 */
const ENHANCED_VERIFICATION_OVERCONFIDENCE = 0.40;

/**
 * Overconfidence rate above which Sonnet gets escalated to Opus.
 */
const ESCALATION_OVERCONFIDENCE = 0.60;

export class CalibrationAwareRouter implements ICalibrationAwareRouter {
  constructor(
    private readonly calibrator: IConfidenceCalibrator,
    private readonly overconfidenceDetector: IOverconfidenceDetector,
  ) {}

  computeAdjustment(
    goalId: string,
    taskType: string,
    baseTier: ModelTier,
  ): ICalibrationRoutingAdjustment {
    // Check if we have calibration data for this combination
    const scopedCurve = this.calibrator.getScopedCurve(baseTier, taskType);

    if (!scopedCurve) {
      // No scoped data — try tier-level data
      const tierProfile = this.calibrator.getModelTierProfile(baseTier);

      if (tierProfile.totalDataPoints < 10) {
        return this.noAdjustment(goalId, baseTier);
      }

      // Use tier-level curve as fallback
      return this.computeFromCurve(
        goalId,
        taskType,
        baseTier,
        tierProfile.curve,
      );
    }

    return this.computeFromCurve(goalId, taskType, baseTier, scopedCurve);
  }

  hasCalibrationData(modelTier: ModelTier, taskType: string): boolean {
    const curve = this.calibrator.getScopedCurve(modelTier, taskType);
    return curve !== null && curve.totalDataPoints >= 10;
  }

  private computeFromCurve(
    goalId: string,
    taskType: string,
    baseTier: ModelTier,
    curve: ICalibrationCurve,
  ): ICalibrationRoutingAdjustment {
    const quality = this.calibrator.assessQuality(curve);
    const alert = this.overconfidenceDetector.checkScope(baseTier, taskType);

    // Well-calibrated: no adjustment needed
    if (quality === "well-calibrated") {
      return {
        goalId,
        adjusted: false,
        originalTier: baseTier,
        adjustedTier: baseTier,
        verificationLevel: "standard",
        relevantECE: curve.expectedCalibrationError,
        relevantOverconfidenceRate: curve.overconfidenceRate,
        reasoning: `Well-calibrated (ECE ${curve.expectedCalibrationError.toFixed(3)}) for ${baseTier} on ${taskType}. No adjustment needed.`,
      };
    }

    // Moderate calibration: keep tier but may enhance verification
    if (quality === "moderate") {
      const verificationLevel = this.determineVerificationLevel(curve);

      return {
        goalId,
        adjusted: verificationLevel !== "standard",
        originalTier: baseTier,
        adjustedTier: baseTier,
        verificationLevel,
        relevantECE: curve.expectedCalibrationError,
        relevantOverconfidenceRate: curve.overconfidenceRate,
        reasoning: `Moderate calibration (ECE ${curve.expectedCalibrationError.toFixed(3)}, overconfidence ${(curve.overconfidenceRate * 100).toFixed(0)}%) for ${baseTier} on ${taskType}. Verification: ${verificationLevel}.`,
      };
    }

    // Poorly calibrated: consider tier escalation
    return this.handlePoorCalibration(
      goalId,
      taskType,
      baseTier,
      curve,
      quality,
      alert,
    );
  }

  private handlePoorCalibration(
    goalId: string,
    taskType: string,
    baseTier: ModelTier,
    curve: ICalibrationCurve,
    _quality: CalibrationQuality,
    alert: ReturnType<IOverconfidenceDetector["checkScope"]>,
  ): ICalibrationRoutingAdjustment {
    const ece = curve.expectedCalibrationError;
    const overconfRate = curve.overconfidenceRate;

    // Sonnet + poorly calibrated + severe overconfidence → escalate to Opus
    if (
      baseTier === "claude-sonnet-4-6" &&
      ece >= ESCALATION_ECE_THRESHOLD &&
      overconfRate >= ESCALATION_OVERCONFIDENCE
    ) {
      return {
        goalId,
        adjusted: true,
        originalTier: baseTier,
        adjustedTier: "claude-opus-4-6",
        verificationLevel: "enhanced",
        relevantECE: ece,
        relevantOverconfidenceRate: overconfRate,
        reasoning: `Poorly calibrated Sonnet (ECE ${ece.toFixed(3)}, overconfidence ${(overconfRate * 100).toFixed(0)}%) for ${taskType}. Escalating to Opus with enhanced verification. ${alert ? `Alert: ${alert.severity}.` : ""}`,
      };
    }

    // Opus + poorly calibrated → can't escalate, use maximum verification
    if (baseTier === "claude-opus-4-6" && overconfRate >= ENHANCED_VERIFICATION_OVERCONFIDENCE) {
      return {
        goalId,
        adjusted: true,
        originalTier: baseTier,
        adjustedTier: baseTier,
        verificationLevel: "maximum",
        relevantECE: ece,
        relevantOverconfidenceRate: overconfRate,
        reasoning: `Poorly calibrated Opus (ECE ${ece.toFixed(3)}, overconfidence ${(overconfRate * 100).toFixed(0)}%) for ${taskType}. Maximum verification applied. ${alert ? `Alert: ${alert.severity}.` : ""}`,
      };
    }

    // Poorly calibrated but not enough overconfidence for escalation
    const verificationLevel = this.determineVerificationLevel(curve);

    return {
      goalId,
      adjusted: verificationLevel !== "standard",
      originalTier: baseTier,
      adjustedTier: baseTier,
      verificationLevel,
      relevantECE: ece,
      relevantOverconfidenceRate: overconfRate,
      reasoning: `Poorly calibrated (ECE ${ece.toFixed(3)}, overconfidence ${(overconfRate * 100).toFixed(0)}%) for ${baseTier} on ${taskType}. Verification: ${verificationLevel}.`,
    };
  }

  private determineVerificationLevel(
    curve: ICalibrationCurve,
  ): CalibrationVerificationLevel {
    if (curve.overconfidenceRate >= ESCALATION_OVERCONFIDENCE) {
      return "maximum";
    }

    if (curve.overconfidenceRate >= ENHANCED_VERIFICATION_OVERCONFIDENCE) {
      return "enhanced";
    }

    return "standard";
  }

  private noAdjustment(
    goalId: string,
    baseTier: ModelTier,
  ): ICalibrationRoutingAdjustment {
    return {
      goalId,
      adjusted: false,
      originalTier: baseTier,
      adjustedTier: baseTier,
      verificationLevel: "standard",
      relevantECE: null,
      relevantOverconfidenceRate: null,
      reasoning: "Insufficient calibration data. No adjustment applied.",
    };
  }
}
