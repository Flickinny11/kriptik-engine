/**
 * OverconfidenceDetector — identifies agents/tiers whose confidence
 * consistently exceeds their actual quality.
 *
 * Scans calibration profiles across model tiers and task types,
 * generating alerts when overconfidence rates exceed severity thresholds.
 * These alerts feed into routing adjustments (escalate to Opus) and
 * verification level decisions (add extra checks).
 *
 * Spec Section 5.3, Signal 3 — "catches the specific failure mode where
 * a degrading agent produces confident-sounding but shallow code."
 * Spec Section 12.4, Step 24 — Overconfidence detection
 */

import type {
  ModelTier,
  IOverconfidenceAlert,
  OverconfidenceSeverity,
  OverconfidenceScope,
  OverconfidenceRecommendation,
  IOverconfidenceDetector,
  IConfidenceCalibrator,
  IPredictionAccuracyTracker,
  ICalibrationCurve,
} from "@kriptik/shared-interfaces";

/**
 * Overconfidence rate thresholds per severity level.
 */
const SEVERITY_THRESHOLDS = {
  mild: 0.30,       // 30%+ overconfidence rate triggers mild
  moderate: 0.50,   // 50%+ triggers moderate
  severe: 0.70,     // 70%+ triggers severe
} as const;

/**
 * Minimum data points required before an overconfidence alert is generated.
 * Prevents false alerts from small sample sizes.
 */
const MIN_ALERT_DATA_POINTS = 15;

/** Counter for generating unique alert IDs. */
let alertCounter = 0;

export class OverconfidenceDetector implements IOverconfidenceDetector {
  constructor(
    private readonly calibrator: IConfidenceCalibrator,
    private readonly tracker: IPredictionAccuracyTracker,
  ) {}

  scan(): readonly IOverconfidenceAlert[] {
    const alerts: IOverconfidenceAlert[] = [];

    // Scan each model tier
    const tiers: ModelTier[] = ["claude-opus-4-6", "claude-sonnet-4-6"];
    for (const tier of tiers) {
      const tierAlert = this.checkModelTier(tier);
      if (tierAlert) {
        alerts.push(tierAlert);
      }
    }

    // Scan each task type (collect unique task types from data)
    const taskTypes = this.collectTaskTypes();
    for (const taskType of taskTypes) {
      const taskAlert = this.checkTaskType(taskType);
      if (taskAlert) {
        alerts.push(taskAlert);
      }

      // Scan each tier × task type combination
      for (const tier of tiers) {
        const scopedAlert = this.checkScope(tier, taskType);
        if (scopedAlert) {
          alerts.push(scopedAlert);
        }
      }
    }

    return alerts;
  }

  checkModelTier(modelTier: ModelTier): IOverconfidenceAlert | null {
    const profile = this.calibrator.getModelTierProfile(modelTier);

    if (profile.totalDataPoints < MIN_ALERT_DATA_POINTS) {
      return null;
    }

    return this.evaluateCurve(
      profile.curve,
      { type: "model-tier", modelTier },
    );
  }

  checkTaskType(taskType: string): IOverconfidenceAlert | null {
    const profile = this.calibrator.getTaskTypeProfile(taskType);

    if (profile.totalDataPoints < MIN_ALERT_DATA_POINTS) {
      return null;
    }

    return this.evaluateCurve(
      profile.curve,
      { type: "task-type", taskType },
    );
  }

  checkScope(modelTier: ModelTier, taskType: string): IOverconfidenceAlert | null {
    const curve = this.calibrator.getScopedCurve(modelTier, taskType);

    if (!curve || curve.totalDataPoints < MIN_ALERT_DATA_POINTS) {
      return null;
    }

    return this.evaluateCurve(
      curve,
      { type: "model-tier-task-type", modelTier, taskType },
    );
  }

  getActiveAlerts(): readonly IOverconfidenceAlert[] {
    return this.scan();
  }

  private evaluateCurve(
    curve: ICalibrationCurve,
    scope: OverconfidenceScope,
  ): IOverconfidenceAlert | null {
    const overconfidenceRate = curve.overconfidenceRate;

    if (overconfidenceRate < SEVERITY_THRESHOLDS.mild) {
      return null;
    }

    const severity = this.classifySeverity(overconfidenceRate);
    const recommendation = this.computeRecommendation(severity, scope);

    // Compute mean error for overconfident predictions specifically
    const meanOverconfidenceError = this.computeMeanOverconfidenceError(scope);

    return {
      id: `overconf-${++alertCounter}`,
      scope,
      severity,
      overconfidenceRate,
      meanOverconfidenceError,
      recommendation,
      raisedAt: new Date(),
    };
  }

  private classifySeverity(overconfidenceRate: number): OverconfidenceSeverity {
    if (overconfidenceRate >= SEVERITY_THRESHOLDS.severe) return "severe";
    if (overconfidenceRate >= SEVERITY_THRESHOLDS.moderate) return "moderate";
    return "mild";
  }

  private computeRecommendation(
    severity: OverconfidenceSeverity,
    scope: OverconfidenceScope,
  ): OverconfidenceRecommendation {
    // Severe overconfidence on Sonnet → escalate to Opus
    if (
      severity === "severe" &&
      (scope.type === "model-tier" || scope.type === "model-tier-task-type") &&
      scope.modelTier === "claude-sonnet-4-6"
    ) {
      return "escalate-to-opus";
    }

    // Moderate overconfidence → add verification
    if (severity === "moderate") {
      return "add-verification";
    }

    // Severe overconfidence on Opus → add verification (can't escalate further)
    if (severity === "severe") {
      return "add-verification";
    }

    // Mild → monitor
    return "monitor";
  }

  private computeMeanOverconfidenceError(scope: OverconfidenceScope): number {
    let filter: { modelTier?: ModelTier; taskType?: string } = {};

    if (scope.type === "model-tier") {
      filter = { modelTier: scope.modelTier };
    } else if (scope.type === "task-type") {
      filter = { taskType: scope.taskType };
    } else {
      filter = { modelTier: scope.modelTier, taskType: scope.taskType };
    }

    const points = this.tracker.getDataPoints({
      ...filter,
      direction: "overconfident",
    });

    if (points.length === 0) return 0;

    return (
      points.reduce((sum, dp) => sum + dp.calibrationError, 0) / points.length
    );
  }

  private collectTaskTypes(): ReadonlySet<string> {
    const types = new Set<string>();
    const allPoints = this.tracker.getDataPoints();

    for (const dp of allPoints) {
      types.add(dp.prediction.taskType);
    }

    return types;
  }
}
