/**
 * FlywheelHealthMonitor — monitors the continuous learning pipeline
 * for stalls, degradation, and anomalies.
 *
 * Detects when learning subsystems stop producing signals, when calibration
 * quality degrades, when knowledge growth stalls, or when routing
 * optimization plateaus. Produces diagnostic alerts with actionable
 * recommendations.
 *
 * The monitor tracks:
 * - Per-subsystem signal freshness (builds since last signal)
 * - Per-subsystem signal rate (signals per build over a window)
 * - Calibration quality trends (ECE between snapshots)
 * - Knowledge growth continuity (trails, playbooks, patterns)
 * - Routing phase progression (is routing advancing as expected?)
 *
 * Spec Section 10.4 — the flywheel must be monitored to ensure it
 *   compounds intelligence across builds.
 * Spec Section 12.4, Step 26 — Flywheel Health Monitor.
 */

import type {
  IFlywheelHealthMonitor,
  IFlywheelMetricsSnapshot,
  IFlywheelHealthCheckResult,
  IFlywheelHealthAlert,
  IFlywheelHealthConfig,
  IFlywheelDiagnostic,
  LearningSignalCategory,
  PipelineHealthStatus,
  SubsystemHealthStatus,
  FlywheelAlertSeverity,
} from "@kriptik/shared-interfaces";

/** Default health monitoring configuration. */
const DEFAULT_CONFIG: IFlywheelHealthConfig = {
  maxBuildsSilentWarning: 3,
  maxBuildsSilentCritical: 10,
  minTrailsPerBuild: 1,
  eceRegressionThreshold: 0.03,
  warmUpBuilds: 5,
};

/** All learning signal categories for iteration. */
const ALL_CATEGORIES: readonly LearningSignalCategory[] = [
  "trail-extraction",
  "playbook-evolution",
  "anti-pattern-inference",
  "cross-build-pattern",
  "confidence-calibration",
  "design-scoring-calibration",
  "routing-outcome",
  "ux-verification",
  "intent-satisfaction",
];

/** Expected minimum signals per build by category. */
const EXPECTED_SIGNALS_PER_BUILD: Readonly<Record<LearningSignalCategory, number>> = {
  "trail-extraction": 1,        // Every build should produce trails
  "playbook-evolution": 0.3,    // Not every build evolves playbooks
  "anti-pattern-inference": 0.1, // Rare — anti-patterns emerge slowly
  "cross-build-pattern": 0.1,   // Rare — cross-build patterns need many builds
  "confidence-calibration": 0.5, // Most builds have confidence data
  "design-scoring-calibration": 0.5, // Most builds have design scores
  "routing-outcome": 1,         // Every build produces routing outcomes
  "ux-verification": 0.5,       // Not every build is UX-verified
  "intent-satisfaction": 0.5,   // Not every build has intent measurement
};

/**
 * Monitors flywheel health by tracking signal freshness, rates,
 * and quality metrics across all learning subsystems.
 */
export class FlywheelHealthMonitor implements IFlywheelHealthMonitor {
  private readonly config: IFlywheelHealthConfig;
  private readonly activeAlerts: Map<string, IFlywheelHealthAlert> = new Map();

  /** Track last signal event per category: { category → { buildId, timestamp } } */
  private readonly lastSignalEvents: Map<LearningSignalCategory, { buildId: string; timestamp: Date }> = new Map();

  /** Track signal count per category over a rolling window of builds. */
  private readonly signalCounts: Map<LearningSignalCategory, number> = new Map();

  /** Total builds tracked since monitor started. */
  private totalBuildsTracked = 0;

  constructor(config?: Partial<IFlywheelHealthConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  checkHealth(
    currentSnapshot: IFlywheelMetricsSnapshot,
    previousSnapshot: IFlywheelMetricsSnapshot | null,
  ): IFlywheelHealthCheckResult {
    const now = new Date();
    const totalBuilds = currentSnapshot.knowledgeHealth.totalBuilds;

    // Don't raise alerts during warm-up
    if (totalBuilds < this.config.warmUpBuilds) {
      return {
        status: "healthy",
        newAlerts: [],
        resolvedAlertIds: [],
        subsystemHealth: this.buildSubsystemHealth(),
        checkedAt: now,
      };
    }

    const newAlerts: IFlywheelHealthAlert[] = [];
    const resolvedAlertIds: string[] = [];

    // Check each subsystem for staleness
    for (const category of ALL_CATEGORIES) {
      const alerts = this.checkSubsystemHealth(category, totalBuilds, now);
      newAlerts.push(...alerts);
    }

    // Check calibration quality trends (only if we have a previous snapshot)
    if (previousSnapshot !== null) {
      const calibrationAlerts = this.checkCalibrationTrends(
        currentSnapshot,
        previousSnapshot,
        now,
      );
      newAlerts.push(...calibrationAlerts);
    }

    // Check knowledge growth continuity
    const growthAlerts = this.checkKnowledgeGrowth(currentSnapshot, now);
    newAlerts.push(...growthAlerts);

    // Resolve any previously raised alerts that are no longer applicable
    for (const [id, alert] of this.activeAlerts) {
      if (this.isAlertResolved(alert, currentSnapshot)) {
        resolvedAlertIds.push(id);
        this.activeAlerts.delete(id);
      }
    }

    // Add new alerts
    for (const alert of newAlerts) {
      this.activeAlerts.set(alert.id, alert);
    }

    const status = this.computeStatus();

    return {
      status,
      newAlerts,
      resolvedAlertIds,
      subsystemHealth: this.buildSubsystemHealth(),
      checkedAt: now,
    };
  }

  recordSignalEvent(category: LearningSignalCategory, buildId: string): void {
    this.lastSignalEvents.set(category, { buildId, timestamp: new Date() });
    this.signalCounts.set(category, (this.signalCounts.get(category) ?? 0) + 1);
    this.totalBuildsTracked++;
  }

  getStatus(): PipelineHealthStatus {
    return this.computeStatus();
  }

  getActiveAlerts(): readonly IFlywheelHealthAlert[] {
    return [...this.activeAlerts.values()];
  }

  /**
   * Check a single subsystem for signal staleness.
   */
  private checkSubsystemHealth(
    category: LearningSignalCategory,
    totalBuilds: number,
    now: Date,
  ): IFlywheelHealthAlert[] {
    const alerts: IFlywheelHealthAlert[] = [];
    const lastEvent = this.lastSignalEvents.get(category);

    if (lastEvent === undefined && totalBuilds > this.config.maxBuildsSilentWarning) {
      // Never received a signal from this subsystem
      const severity: FlywheelAlertSeverity =
        totalBuilds > this.config.maxBuildsSilentCritical ? "critical" : "warning";

      const existingAlertKey = `stale-${category}`;
      if (!this.activeAlerts.has(existingAlertKey)) {
        alerts.push({
          id: existingAlertKey,
          subsystem: category,
          severity,
          description: `No signals received from ${category} after ${totalBuilds} builds.`,
          diagnostics: {
            buildsSinceLastSignal: totalBuilds,
            timeSinceLastSignalMs: 0,
            expectedSignalsPerBuild: EXPECTED_SIGNALS_PER_BUILD[category],
            actualSignalsPerBuild: 0,
            triggeringMetric: "buildsSinceLastSignal",
            threshold: this.config.maxBuildsSilentWarning,
            actualValue: totalBuilds,
          },
          recommendation: `Verify that the ${category} subsystem is wired into the build completion pipeline.`,
          raisedAt: now,
        });
      }
    }

    return alerts;
  }

  /**
   * Check calibration quality trends between snapshots.
   */
  private checkCalibrationTrends(
    current: IFlywheelMetricsSnapshot,
    previous: IFlywheelMetricsSnapshot,
    now: Date,
  ): IFlywheelHealthAlert[] {
    const alerts: IFlywheelHealthAlert[] = [];

    // Confidence calibration ECE regression
    if (
      current.confidenceCalibration.totalDataPoints > 30 &&
      previous.confidenceCalibration.totalDataPoints > 20
    ) {
      const eceDelta = current.confidenceCalibration.ece - previous.confidenceCalibration.ece;
      if (eceDelta > this.config.eceRegressionThreshold) {
        const alertId = `calibration-regression-confidence-${now.getTime()}`;
        if (!this.activeAlerts.has(alertId)) {
          alerts.push({
            id: alertId,
            subsystem: "confidence-calibration",
            severity: "warning",
            description: `Confidence calibration ECE increased by ${eceDelta.toFixed(3)} (${previous.confidenceCalibration.ece.toFixed(3)} → ${current.confidenceCalibration.ece.toFixed(3)}). Calibration quality is degrading.`,
            diagnostics: {
              buildsSinceLastSignal: 0,
              timeSinceLastSignalMs: 0,
              expectedSignalsPerBuild: 1,
              actualSignalsPerBuild: 1,
              triggeringMetric: "confidenceECEDelta",
              threshold: this.config.eceRegressionThreshold,
              actualValue: eceDelta,
            },
            recommendation: "Investigate whether agent behavior has changed or whether new task types are introducing noise into calibration curves.",
            raisedAt: now,
          });
        }
      }
    }

    // Design scoring ECE regression (0-100 scale, threshold scaled by 100)
    if (
      current.designScoringCalibration.totalDataPoints > 15 &&
      previous.designScoringCalibration.totalDataPoints > 10
    ) {
      const designECEDelta = current.designScoringCalibration.ece - previous.designScoringCalibration.ece;
      const designThreshold = this.config.eceRegressionThreshold * 100; // Scale to 0-100
      if (designECEDelta > designThreshold) {
        const alertId = `calibration-regression-design-${now.getTime()}`;
        if (!this.activeAlerts.has(alertId)) {
          alerts.push({
            id: alertId,
            subsystem: "design-scoring-calibration",
            severity: "warning",
            description: `Design scoring ECE increased by ${designECEDelta.toFixed(1)} (${previous.designScoringCalibration.ece.toFixed(1)} → ${current.designScoringCalibration.ece.toFixed(1)}). Design score calibration is degrading.`,
            diagnostics: {
              buildsSinceLastSignal: 0,
              timeSinceLastSignalMs: 0,
              expectedSignalsPerBuild: 1,
              actualSignalsPerBuild: 1,
              triggeringMetric: "designECEDelta",
              threshold: designThreshold,
              actualValue: designECEDelta,
            },
            recommendation: "Run DesignScoringFeedbackLoop to recalibrate dimension weights. Check whether new app types are introducing scoring bias.",
            raisedAt: now,
          });
        }
      }
    }

    return alerts;
  }

  /**
   * Check knowledge base growth continuity.
   */
  private checkKnowledgeGrowth(
    snapshot: IFlywheelMetricsSnapshot,
    now: Date,
  ): IFlywheelHealthAlert[] {
    const alerts: IFlywheelHealthAlert[] = [];
    const knowledge = snapshot.knowledgeHealth;

    // Check if quality uplift is present (the 91% vs 74% metric)
    if (
      knowledge.totalBuilds > 50 &&
      knowledge.richlyCoveredTaskTypes > 0 &&
      knowledge.qualityUplift <= 0
    ) {
      const alertId = `no-quality-uplift-${now.getTime()}`;
      if (!this.activeAlerts.has(alertId)) {
        alerts.push({
          id: alertId,
          subsystem: "pipeline-overall",
          severity: "warning",
          description: `After ${knowledge.totalBuilds} builds with ${knowledge.richlyCoveredTaskTypes} richly-covered task types, there is no measurable quality uplift from trail coverage (uplift: ${knowledge.qualityUplift.toFixed(2)}). The knowledge base may not be improving build quality.`,
          diagnostics: {
            buildsSinceLastSignal: 0,
            timeSinceLastSignalMs: 0,
            expectedSignalsPerBuild: 1,
            actualSignalsPerBuild: 1,
            triggeringMetric: "qualityUplift",
            threshold: 0.05,
            actualValue: knowledge.qualityUplift,
          },
          recommendation: "Review trail quality and relevance. Trails may be stored but not effectively injected into golden windows, or trail ranking may need tuning.",
          raisedAt: now,
        });
      }
    }

    // Check trail freshness
    if (knowledge.totalTrails > 100 && knowledge.trailFreshnessRate < 0.3) {
      const alertId = `stale-trails-${now.getTime()}`;
      if (!this.activeAlerts.has(alertId)) {
        alerts.push({
          id: alertId,
          subsystem: "trail-extraction",
          severity: "info",
          description: `Only ${(knowledge.trailFreshnessRate * 100).toFixed(0)}% of trails have been validated in the last 90 days. Stale trails may provide outdated guidance.`,
          diagnostics: {
            buildsSinceLastSignal: 0,
            timeSinceLastSignalMs: 0,
            expectedSignalsPerBuild: 1,
            actualSignalsPerBuild: 1,
            triggeringMetric: "trailFreshnessRate",
            threshold: 0.3,
            actualValue: knowledge.trailFreshnessRate,
          },
          recommendation: "The Librarian should increase trail deprecation for patterns that haven't been validated recently.",
          raisedAt: now,
        });
      }
    }

    return alerts;
  }

  /**
   * Check if a previously raised alert has been resolved.
   */
  private isAlertResolved(
    alert: IFlywheelHealthAlert,
    snapshot: IFlywheelMetricsSnapshot,
  ): boolean {
    // Stale subsystem alerts resolve when we receive a signal
    if (alert.id.startsWith("stale-")) {
      const category = alert.subsystem as LearningSignalCategory;
      const lastEvent = this.lastSignalEvents.get(category);
      return lastEvent !== undefined && lastEvent.timestamp > alert.raisedAt;
    }

    // Calibration alerts resolve when quality improves
    if (alert.id.startsWith("calibration-regression-confidence")) {
      return snapshot.confidenceCalibration.quality !== "poorly-calibrated";
    }
    if (alert.id.startsWith("calibration-regression-design")) {
      return snapshot.designScoringCalibration.quality !== "poorly-calibrated";
    }

    return false;
  }

  /**
   * Build subsystem health status for all categories.
   */
  private buildSubsystemHealth(): Record<LearningSignalCategory, SubsystemHealthStatus> {
    const health: Record<string, SubsystemHealthStatus> = {};

    for (const category of ALL_CATEGORIES) {
      const lastEvent = this.lastSignalEvents.get(category);
      const signalCount = this.signalCounts.get(category) ?? 0;
      const producing = lastEvent !== undefined;

      // Approximate builds since last signal
      const buildsSinceLastSignal = producing
        ? Math.max(0, this.totalBuildsTracked - signalCount)
        : this.totalBuildsTracked;

      const signalsPerBuild = this.totalBuildsTracked > 0
        ? signalCount / this.totalBuildsTracked
        : 0;

      const expected = EXPECTED_SIGNALS_PER_BUILD[category];
      const qualityAcceptable = signalsPerBuild >= expected * 0.5;

      let status: "healthy" | "degraded" | "stalled";
      if (!producing && this.totalBuildsTracked > this.config.maxBuildsSilentCritical) {
        status = "stalled";
      } else if (signalsPerBuild < expected * 0.5 && this.totalBuildsTracked > this.config.warmUpBuilds) {
        status = "degraded";
      } else {
        status = "healthy";
      }

      health[category] = {
        producing,
        buildsSinceLastSignal,
        signalsPerBuild,
        qualityAcceptable,
        status,
      };
    }

    return health as Record<LearningSignalCategory, SubsystemHealthStatus>;
  }

  /**
   * Compute overall pipeline status from active alerts.
   */
  private computeStatus(): PipelineHealthStatus {
    const alerts = [...this.activeAlerts.values()];
    const criticalCount = alerts.filter(a => a.severity === "critical").length;
    const warningCount = alerts.filter(a => a.severity === "warning").length;

    if (criticalCount >= 2) return "critical";
    if (criticalCount >= 1) return "stalled";
    if (warningCount >= 2) return "degraded";
    return "healthy";
  }
}
