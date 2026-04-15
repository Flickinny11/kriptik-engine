/**
 * FlywheelMetricsDashboard — computes and tracks the flywheel's
 * compounding intelligence metrics.
 *
 * Provides the metrics that prove the system is getting smarter with
 * each build: knowledge base growth rate, prediction accuracy improvement,
 * routing optimization trajectory, and design score calibration.
 *
 * Spec Section 1.2, Principle 5 — "The knowledge base is the competitive
 *   moat — not the model. After 10,000 builds, a new entrant would need to
 *   replicate not just the architecture but the accumulated knowledge."
 * Spec Section 6.7 — routing trajectory across four phases.
 * Spec Section 12.4, Step 26 — Flywheel Metrics Dashboard.
 */

import type {
  IFlywheelMetricsDashboard,
  IFlywheelMetricsDashboardDeps,
  IFlywheelMetricsSnapshot,
  IBundleRoutingResult,
  IRoutingPhaseProgress,
  ILearningRateMetrics,
  MetricTrend,
  PipelineHealthStatus,
  IFlywheelHealthAlert,
  ICalibrationMetricsSummary,
  IDesignCalibrationMetricsSummary,
} from "@kriptik/shared-interfaces";

import type {
  IKnowledgeHealthSnapshot,
  IRoutingMetricsSummary,
  RoutingPhase,
} from "@kriptik/shared-interfaces";

/**
 * Computes unified flywheel metrics by querying all subsystem dashboards.
 *
 * Maintains a history of bundle results for learning rate computation
 * and a history of snapshots for trend analysis.
 */
export class FlywheelMetricsDashboard implements IFlywheelMetricsDashboard {
  private readonly bundleResults: IBundleRoutingResult[] = [];
  private readonly snapshots: IFlywheelMetricsSnapshot[] = [];

  constructor(private readonly deps: IFlywheelMetricsDashboardDeps) {}

  computeSnapshot(): IFlywheelMetricsSnapshot {
    const knowledgeHealth = this.deps.getKnowledgeHealth();
    const confidenceCalibration = this.deps.getConfidenceCalibrationSummary();
    const designScoringCalibration = this.deps.getDesignCalibrationSummary();
    const routing = this.deps.getRoutingMetrics();
    const learningRate = this.computeLearningRate();
    const healthAlerts = this.deriveHealthAlerts(knowledgeHealth, confidenceCalibration, designScoringCalibration, routing);
    const pipelineHealth = this.derivePipelineHealth(healthAlerts);

    const snapshot: IFlywheelMetricsSnapshot = {
      snapshotAt: new Date(),
      knowledgeHealth,
      confidenceCalibration,
      designScoringCalibration,
      routing,
      learningRate,
      pipelineHealth,
      healthAlerts,
    };

    this.snapshots.push(snapshot);
    return snapshot;
  }

  recordBundleResult(result: IBundleRoutingResult): void {
    this.bundleResults.push(result);
  }

  getSnapshotHistory(limit = 20): readonly IFlywheelMetricsSnapshot[] {
    if (this.snapshots.length <= limit) {
      return [...this.snapshots];
    }
    return this.snapshots.slice(-limit);
  }

  getRoutingPhaseProgress(): IRoutingPhaseProgress {
    const routing = this.deps.getRoutingMetrics();
    const totalBuilds = routing.totalBuilds;
    const currentPhase = routing.currentPhase;

    // Phase boundaries from Spec Section 6.7
    const phaseBoundaries: Record<number, number> = {
      1: 100,
      2: 500,
      3: 2000,
    };

    const buildsToNextPhase = currentPhase < 4
      ? phaseBoundaries[currentPhase]! - totalBuilds
      : null;

    return {
      currentPhase,
      totalBuilds,
      buildsToNextPhase,
      currentSonnetRate: routing.sonnetRoutingRate,
      estimatedCostSavings: routing.estimatedCostSavings,
    };
  }

  /**
   * Compute learning rate metrics from recent bundle results.
   *
   * Uses the last 10 bundle results to compute per-build averages
   * and detect whether the learning rate is accelerating, steady,
   * or decelerating.
   */
  private computeLearningRate(): ILearningRateMetrics {
    const recentResults = this.bundleResults.slice(-10);

    if (recentResults.length === 0) {
      return {
        trailsPerBuild: 0,
        playbooksPerBuild: 0,
        antiPatternsPer10Builds: 0,
        crossBuildPatternsPer10Builds: 0,
        taskTypeCoverageGrowthRate: 0,
        domainCoverageGrowthRate: 0,
        trajectory: "stable",
      };
    }

    const count = recentResults.length;
    let totalTrails = 0;
    let totalPlaybooks = 0;
    let totalAntiPatterns = 0;
    let totalCrossBuildPatterns = 0;
    let totalNewTaskTypes = 0;

    for (const result of recentResults) {
      const c = result.knowledgeContribution;
      totalTrails += c.newTrails;
      totalPlaybooks += c.newPlaybooks;
      totalAntiPatterns += c.newAntiPatterns;
      totalCrossBuildPatterns += c.newCrossBuildPatterns;
      totalNewTaskTypes += c.newTaskTypes;
    }

    // Compare first half vs second half for trajectory
    const trajectory = this.computeTrajectory(recentResults);

    // Count unique domains in recent results
    const recentDomains = new Set(
      recentResults
        .map(r => r.knowledgeContribution.domain)
        .filter((d): d is string => d !== null)
    );

    return {
      trailsPerBuild: totalTrails / count,
      playbooksPerBuild: totalPlaybooks / count,
      antiPatternsPer10Builds: totalAntiPatterns,
      crossBuildPatternsPer10Builds: totalCrossBuildPatterns,
      taskTypeCoverageGrowthRate: totalNewTaskTypes,
      domainCoverageGrowthRate: recentDomains.size,
      trajectory,
    };
  }

  /**
   * Compare the learning rate of the first half vs the second half
   * of recent bundle results to determine trajectory.
   */
  private computeTrajectory(results: readonly IBundleRoutingResult[]): MetricTrend {
    if (results.length < 4) return "stable";

    const midpoint = Math.floor(results.length / 2);
    const firstHalf = results.slice(0, midpoint);
    const secondHalf = results.slice(midpoint);

    const firstRate = this.averageTrailsPerBuild(firstHalf);
    const secondRate = this.averageTrailsPerBuild(secondHalf);

    // 20% change threshold for trend detection
    if (secondRate > firstRate * 1.2) return "improving";
    if (secondRate < firstRate * 0.8) return "declining";
    return "stable";
  }

  private averageTrailsPerBuild(results: readonly IBundleRoutingResult[]): number {
    if (results.length === 0) return 0;
    const total = results.reduce((sum, r) => sum + r.knowledgeContribution.newTrails, 0);
    return total / results.length;
  }

  /**
   * Derive health alerts from current metrics.
   *
   * Checks for:
   * - Zero trails (pipeline may not be collecting)
   * - Calibration degradation (ECE increasing)
   * - Routing stall (phase not advancing despite build count)
   */
  private deriveHealthAlerts(
    knowledge: IKnowledgeHealthSnapshot,
    confidence: ICalibrationMetricsSummary,
    design: IDesignCalibrationMetricsSummary,
    routing: IRoutingMetricsSummary,
  ): readonly IFlywheelHealthAlert[] {
    const alerts: IFlywheelHealthAlert[] = [];
    const now = new Date();

    // Check if knowledge base is growing
    if (knowledge.totalBuilds > 5 && knowledge.totalTrails === 0) {
      alerts.push({
        id: `alert-no-trails-${now.getTime()}`,
        subsystem: "trail-extraction",
        severity: "critical",
        description: "No trails have been extracted after 5+ builds. The trail extraction pipeline may not be functioning.",
        diagnostics: {
          buildsSinceLastSignal: knowledge.totalBuilds,
          timeSinceLastSignalMs: 0,
          expectedSignalsPerBuild: 1,
          actualSignalsPerBuild: 0,
          triggeringMetric: "totalTrails",
          threshold: 1,
          actualValue: 0,
        },
        recommendation: "Verify that the TrailExtractor is receiving ESAA events and the Librarian is storing trails.",
        raisedAt: now,
      });
    }

    // Check confidence calibration quality
    if (confidence.totalDataPoints > 30 && confidence.quality === "poorly-calibrated") {
      alerts.push({
        id: `alert-poor-confidence-calibration-${now.getTime()}`,
        subsystem: "confidence-calibration",
        severity: "warning",
        description: `Confidence calibration is poor (ECE: ${confidence.ece.toFixed(3)}) despite ${confidence.totalDataPoints} data points. Agent self-assessment does not correlate well with actual quality.`,
        diagnostics: {
          buildsSinceLastSignal: 0,
          timeSinceLastSignalMs: 0,
          expectedSignalsPerBuild: 1,
          actualSignalsPerBuild: 1,
          triggeringMetric: "ECE",
          threshold: 0.15,
          actualValue: confidence.ece,
        },
        recommendation: "Review overconfidence patterns. Consider adjusting routing to use more Opus for poorly-calibrated task types.",
        raisedAt: now,
      });
    }

    // Check design scoring calibration
    if (design.totalDataPoints > 15 && design.quality === "poorly-calibrated") {
      alerts.push({
        id: `alert-poor-design-calibration-${now.getTime()}`,
        subsystem: "design-scoring-calibration",
        severity: "warning",
        description: `Design scoring calibration is poor (ECE: ${design.ece.toFixed(1)}) despite ${design.totalDataPoints} data points. Design quality scores don't predict actual effectiveness.`,
        diagnostics: {
          buildsSinceLastSignal: 0,
          timeSinceLastSignalMs: 0,
          expectedSignalsPerBuild: 1,
          actualSignalsPerBuild: 1,
          triggeringMetric: "designECE",
          threshold: 8,
          actualValue: design.ece,
        },
        recommendation: "Review design scoring dimension weights. Run DesignScoringFeedbackLoop to adjust weights based on actual outcomes.",
        raisedAt: now,
      });
    }

    // Check for routing optimization stall
    if (routing.totalBuilds > 100 && routing.currentPhase === 1) {
      alerts.push({
        id: `alert-routing-stall-${now.getTime()}`,
        subsystem: "routing-outcome",
        severity: "warning",
        description: `Routing is still in Phase 1 despite ${routing.totalBuilds} builds. Expected Phase 2 at build 100.`,
        diagnostics: {
          buildsSinceLastSignal: 0,
          timeSinceLastSignalMs: 0,
          expectedSignalsPerBuild: 1,
          actualSignalsPerBuild: 1,
          triggeringMetric: "routingPhase",
          threshold: 2,
          actualValue: 1,
        },
        recommendation: "Check trail coverage density. Routing may not be advancing because task types lack sufficient trail coverage for Sonnet routing.",
        raisedAt: now,
      });
    }

    return alerts;
  }

  /**
   * Derive overall pipeline health from the set of active alerts.
   */
  private derivePipelineHealth(alerts: readonly IFlywheelHealthAlert[]): PipelineHealthStatus {
    const criticalCount = alerts.filter(a => a.severity === "critical").length;
    const warningCount = alerts.filter(a => a.severity === "warning").length;

    if (criticalCount >= 2) return "critical";
    if (criticalCount >= 1) return "stalled";
    if (warningCount >= 2) return "degraded";
    return "healthy";
  }
}
