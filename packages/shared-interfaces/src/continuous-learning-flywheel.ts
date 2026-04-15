/**
 * Continuous learning flywheel interfaces — the unified pipeline that connects
 * all learning subsystems into a self-reinforcing cycle of compounding intelligence.
 *
 * The flywheel collects learning signals from every completed build, routes them
 * to the appropriate subsystems, tracks compounding metrics, and monitors pipeline
 * health. This is the final integration layer that makes Cortex's knowledge base
 * the competitive moat described in the spec.
 *
 * Signal sources collected at build completion:
 * - Trail extractions (Step 7) — implementation decisions, dead ends, violations
 * - Playbook evolutions (Step 18) — new, reinforced, deprecated, and merged playbooks
 * - Anti-pattern inferences (Step 20) — newly discovered anti-patterns
 * - Cross-build patterns (Step 21) — statistically significant cross-build insights
 * - Confidence calibration data (Step 24) — prediction vs. evaluator outcome pairs
 * - Design scoring calibration data (Step 25) — design score vs. effectiveness pairs
 * - Routing outcomes (Step 19) — model tier assignment vs. quality outcomes
 * - UX verification results (Step 12) — journey test and inspector findings
 * - Intent satisfaction results (Step 15) — CVS gap analysis
 *
 * Signal destinations:
 * - Trails → Librarian (Step 7) for storage and golden window injection
 * - Patterns → CrossBuildPatternAnalyzer (Step 21) for statistical analysis
 * - Playbooks → PlaybookEvolver (Step 18) for evolution processing
 * - Calibration data → PredictionAccuracyTracker (Step 24) / DesignScoreAccuracyTracker (Step 25)
 * - Routing outcomes → RoutingMetricsTracker (Step 19) for phase progression
 * - Anti-patterns → AntiPatternLibrary (Step 20) for library updates
 * - Domain knowledge → DomainKnowledgeCurator (Step 21) for domain playbook curation
 *
 * Spec Section 1.2, Principle 5 — "Every build feeds data back. Experiential trails,
 *   telemetry, UX results, intent accuracy, and design scores compound. The knowledge
 *   base is the competitive moat — not the model."
 * Spec Section 2.3 — "After 1,000 builds, ICE doesn't just infer what users want —
 *   it KNOWS what users in specific domains want."
 * Spec Section 10.4 — The Learning Signal: "The delta between 'what ICE predicted'
 *   and 'what CVS measured' is the most valuable learning signal in the system."
 * Spec Section 6.7 — Routing trajectory optimization across four phases.
 * Spec Section 12.4, Step 26 — Full continuous learning flywheel activation.
 */

import type { ITrailEntry, TrailOutcome } from "./knowledge.js";
import type { IPlaybook, PlaybookEvolutionType, IBuildOutcome } from "./playbooks.js";
import type { IAntiPattern } from "./anti-patterns.js";
import type { ICrossBuildPattern, IDomainClassification, IBuildKnowledgeContribution, IKnowledgeHealthSnapshot } from "./cross-build.js";
import type { IConfidencePrediction, ICalibrationDataPoint, ICalibrationCurve, CalibrationQuality } from "./confidence-calibration.js";
import type { IDesignScorePrediction, IDesignCalibrationDataPoint, IDesignCalibrationCurve, DesignCalibrationQuality } from "./design-scoring-calibration.js";
import type { IRoutingDecision, IRoutingOutcome, IRoutingMetricsSummary, RoutingPhase } from "./routing.js";
import type { IUXVerificationResult } from "./ux-verification.js";
import type { IIntentSatisfactionResult } from "./cvs.js";
import type { IDesignQualityScore } from "./enforcement.js";

// ---------------------------------------------------------------------------
// Learning signal types
// ---------------------------------------------------------------------------

/**
 * Categories of learning signals collected at build completion.
 *
 * Each category corresponds to a subsystem that produced learning data
 * during the build. The flywheel collects all categories and routes them
 * to the appropriate processors.
 *
 * Spec Section 10.4 — multiple signal types feed the learning pipeline.
 */
export type LearningSignalCategory =
  | "trail-extraction"           // New trails from this build (Step 7)
  | "playbook-evolution"         // Playbook changes from this build (Step 18)
  | "anti-pattern-inference"     // New or reinforced anti-patterns (Step 20)
  | "cross-build-pattern"        // Cross-build pattern updates (Step 21)
  | "confidence-calibration"     // Confidence prediction/outcome pairs (Step 24)
  | "design-scoring-calibration" // Design score prediction/outcome data (Step 25)
  | "routing-outcome"            // Model tier routing effectiveness (Step 19)
  | "ux-verification"            // UX journey test and inspector results (Step 12)
  | "intent-satisfaction";       // CVS intent gap analysis (Step 15)

/**
 * ILearningSignal — a single learning signal produced by a build.
 *
 * Learning signals are the atomic units of the flywheel. Each signal
 * carries data from one subsystem about one aspect of a build's outcome.
 *
 * Spec Section 10.4 — "The delta between 'what ICE predicted' and
 *   'what CVS measured' is the most valuable learning signal."
 */
export interface ILearningSignal {
  /** Unique signal identifier. */
  readonly id: string;

  /** Which subsystem produced this signal. */
  readonly category: LearningSignalCategory;

  /** The build that produced this signal. */
  readonly buildId: string;

  /** When this signal was collected. */
  readonly collectedAt: Date;

  /** The signal payload — type depends on category. */
  readonly payload: LearningSignalPayload;
}

/**
 * Union type for learning signal payloads, discriminated by category.
 *
 * Each payload type carries the specific data needed by the target
 * subsystem to process the learning signal.
 */
export type LearningSignalPayload =
  | ITrailExtractionPayload
  | IPlaybookEvolutionPayload
  | IAntiPatternInferencePayload
  | ICrossBuildPatternPayload
  | IConfidenceCalibrationPayload
  | IDesignScoringCalibrationPayload
  | IRoutingOutcomePayload
  | IUXVerificationPayload
  | IIntentSatisfactionPayload;

// ---------------------------------------------------------------------------
// Signal payloads (one per category)
// ---------------------------------------------------------------------------

/**
 * Trail extraction payload — new trails produced by this build.
 * Spec Section 6.3, Section 9.2 Step 1 — trail extraction at build completion.
 */
export interface ITrailExtractionPayload {
  readonly type: "trail-extraction";
  /** New trails extracted from this build's agent sessions. */
  readonly trails: readonly ITrailEntry[];
  /** Count by trail type for quick summary. */
  readonly countByType: Readonly<Record<string, number>>;
  /** Count by outcome for quick summary. */
  readonly countByOutcome: Readonly<Record<TrailOutcome, number>>;
}

/**
 * Playbook evolution payload — playbook changes from this build.
 * Spec Section 6.4 — ACE-style evolving playbooks.
 */
export interface IPlaybookEvolutionPayload {
  readonly type: "playbook-evolution";
  /** Newly extracted playbooks. */
  readonly newPlaybooks: readonly IPlaybook[];
  /** Playbook IDs that were reinforced by this build. */
  readonly reinforcedPlaybookIds: readonly string[];
  /** Playbook IDs that were deprecated after this build. */
  readonly deprecatedPlaybookIds: readonly string[];
  /** Playbook IDs that were merged into other playbooks. */
  readonly mergedPlaybookIds: readonly string[];
}

/**
 * Anti-pattern inference payload — anti-pattern updates from this build.
 * Spec Section 2.2 Stage 4 Method 6 — anti-pattern inference.
 */
export interface IAntiPatternInferencePayload {
  readonly type: "anti-pattern-inference";
  /** New anti-patterns discovered. */
  readonly newAntiPatterns: readonly IAntiPattern[];
  /** Anti-pattern IDs reinforced with additional evidence. */
  readonly reinforcedAntiPatternIds: readonly string[];
}

/**
 * Cross-build pattern payload — pattern analysis results from this build.
 * Spec Section 6.3 — cross-build pattern trails.
 */
export interface ICrossBuildPatternPayload {
  readonly type: "cross-build-pattern";
  /** Newly detected patterns. */
  readonly newPatterns: readonly Omit<ICrossBuildPattern, "id">[];
  /** Existing pattern IDs confirmed with new evidence. */
  readonly confirmedPatternIds: readonly string[];
  /** Pattern IDs promoted to trail entries. */
  readonly promotedPatternIds: readonly string[];
}

/**
 * Confidence calibration payload — prediction/outcome pairs from this build.
 * Spec Section 5.3 Signal 3 — confidence calibration.
 */
export interface IConfidenceCalibrationPayload {
  readonly type: "confidence-calibration";
  /** Matched prediction-outcome data points. */
  readonly dataPoints: readonly ICalibrationDataPoint[];
  /** Predictions that couldn't be matched (diagnostic). */
  readonly unmatchedPredictionCount: number;
}

/**
 * Design scoring calibration payload — design score/effectiveness data.
 * Spec Section 7.3 Layer 7, Section 10.4 — design score calibration.
 */
export interface IDesignScoringCalibrationPayload {
  readonly type: "design-scoring-calibration";
  /** The design score prediction recorded at build completion. */
  readonly prediction: IDesignScorePrediction | null;
  /** Matched calibration data points (if post-delivery outcomes are available). */
  readonly dataPoints: readonly IDesignCalibrationDataPoint[];
}

/**
 * Routing outcome payload — model tier routing effectiveness data.
 * Spec Section 6.7 — routing trajectory optimization.
 */
export interface IRoutingOutcomePayload {
  readonly type: "routing-outcome";
  /** Routing decisions and their outcomes for this build's goals. */
  readonly outcomes: readonly IRoutingOutcome[];
  /** Number of escalations triggered during this build. */
  readonly escalationCount: number;
}

/**
 * UX verification payload — journey test and inspector results.
 * Spec Section 8.1 — UX Verification Teams.
 */
export interface IUXVerificationPayload {
  readonly type: "ux-verification";
  /** Verification result from the UX team. */
  readonly result: IUXVerificationResult;
}

/**
 * Intent satisfaction payload — CVS gap analysis results.
 * Spec Section 10.3 — CVS measures intent coverage.
 * Spec Section 10.4 — The delta is the most valuable learning signal.
 */
export interface IIntentSatisfactionPayload {
  readonly type: "intent-satisfaction";
  /** Intent satisfaction result from the CVS. */
  readonly result: IIntentSatisfactionResult;
}

// ---------------------------------------------------------------------------
// Build completion learning bundle
// ---------------------------------------------------------------------------

/**
 * IBuildLearningBundle — the complete set of learning signals collected
 * from a single completed build.
 *
 * The BuildCompletionLearningCollector assembles this bundle at the end
 * of every build. The LearningSignalRouter then processes each signal
 * to the appropriate subsystem.
 *
 * Spec Section 10.4 — "The continuous learning pipeline captures everything:
 *   golden window telemetry, decision records, UX test results, intent
 *   accuracy metrics, design scores, and rotation outcomes."
 */
export interface IBuildLearningBundle {
  /** The build that produced these signals. */
  readonly buildId: string;

  /** Domain classification for this build. */
  readonly domainClassification: IDomainClassification | null;

  /** All learning signals, in collection order. */
  readonly signals: readonly ILearningSignal[];

  /** Quick access to signal counts by category. */
  readonly signalCounts: Readonly<Record<LearningSignalCategory, number>>;

  /** When collection started. */
  readonly collectionStartedAt: Date;

  /** When collection completed. */
  readonly collectionCompletedAt: Date;

  /** Build outcome summary for knowledge contribution tracking. */
  readonly buildOutcome: IBuildOutcome;
}

// ---------------------------------------------------------------------------
// Learning signal routing result
// ---------------------------------------------------------------------------

/**
 * ISignalRoutingResult — the outcome of routing a learning signal to
 * its target subsystem.
 */
export interface ISignalRoutingResult {
  /** The signal that was routed. */
  readonly signalId: string;

  /** The category that determined routing. */
  readonly category: LearningSignalCategory;

  /** Whether routing succeeded. */
  readonly success: boolean;

  /** Error message if routing failed. */
  readonly error: string | null;

  /** Processing time in milliseconds. */
  readonly processingTimeMs: number;
}

/**
 * IBundleRoutingResult — the aggregate result of routing all signals
 * in a build learning bundle.
 */
export interface IBundleRoutingResult {
  /** The build these results are for. */
  readonly buildId: string;

  /** Per-signal routing results. */
  readonly signalResults: readonly ISignalRoutingResult[];

  /** Count of successfully routed signals. */
  readonly successCount: number;

  /** Count of failed routings. */
  readonly failureCount: number;

  /** Total processing time for the entire bundle. */
  readonly totalProcessingTimeMs: number;

  /** Knowledge contribution summary produced by routing. */
  readonly knowledgeContribution: IBuildKnowledgeContribution;

  /** When routing completed. */
  readonly completedAt: Date;
}

// ---------------------------------------------------------------------------
// Flywheel metrics
// ---------------------------------------------------------------------------

/**
 * IFlywheelMetricsSnapshot — comprehensive metrics on the flywheel's
 * compounding intelligence trajectory.
 *
 * Tracks the growth and effectiveness of every learning subsystem,
 * confirming the routing trajectory and knowledge compounding described
 * in the spec.
 *
 * Spec Section 1.2, Principle 5 — "The knowledge base is the competitive
 *   moat — not the model."
 * Spec Section 6.7 — routing phase progression driven by build count
 *   and trail coverage density.
 */
export interface IFlywheelMetricsSnapshot {
  /** When this snapshot was computed. */
  readonly snapshotAt: Date;

  // --- Knowledge base metrics ---

  /** Full knowledge health from KnowledgeCompoundingMetrics (Step 21). */
  readonly knowledgeHealth: IKnowledgeHealthSnapshot;

  // --- Calibration metrics ---

  /** Confidence calibration quality (Step 24). */
  readonly confidenceCalibration: ICalibrationMetricsSummary;

  /** Design scoring calibration quality (Step 25). */
  readonly designScoringCalibration: IDesignCalibrationMetricsSummary;

  // --- Routing metrics ---

  /** Model tier routing summary (Step 19). */
  readonly routing: IRoutingMetricsSummary;

  // --- Learning rate metrics ---

  /** How fast knowledge is growing. */
  readonly learningRate: ILearningRateMetrics;

  // --- Pipeline health ---

  /** Overall pipeline health assessment. */
  readonly pipelineHealth: PipelineHealthStatus;

  /** Active health alerts (empty = healthy). */
  readonly healthAlerts: readonly IFlywheelHealthAlert[];
}

/**
 * Summary of confidence calibration metrics for the flywheel dashboard.
 */
export interface ICalibrationMetricsSummary {
  /** Total matched data points. */
  readonly totalDataPoints: number;

  /** Overall calibration quality. */
  readonly quality: CalibrationQuality;

  /** Expected Calibration Error (0-1, lower is better). */
  readonly ece: number;

  /** Overconfidence rate (0-1). */
  readonly overconfidenceRate: number;

  /** Improvement trend since last snapshot. */
  readonly trend: MetricTrend;
}

/**
 * Summary of design scoring calibration metrics for the flywheel dashboard.
 */
export interface IDesignCalibrationMetricsSummary {
  /** Total matched data points. */
  readonly totalDataPoints: number;

  /** Overall calibration quality. */
  readonly quality: DesignCalibrationQuality;

  /** Expected Calibration Error (0-100 scale). */
  readonly ece: number;

  /** Overrating rate (0-1). */
  readonly overratingRate: number;

  /** Improvement trend since last snapshot. */
  readonly trend: MetricTrend;
}

/**
 * Learning rate metrics — how fast the knowledge base is growing
 * and whether growth is accelerating or decelerating.
 */
export interface ILearningRateMetrics {
  /** Average new trails per build over the last 10 builds. */
  readonly trailsPerBuild: number;

  /** Average new playbooks per build over the last 10 builds. */
  readonly playbooksPerBuild: number;

  /** Average new anti-patterns per 10 builds. */
  readonly antiPatternsPer10Builds: number;

  /** Average new cross-build patterns per 10 builds. */
  readonly crossBuildPatternsPer10Builds: number;

  /** Task type coverage growth rate (new task types per 10 builds). */
  readonly taskTypeCoverageGrowthRate: number;

  /** Domain coverage growth rate (new domains per 10 builds). */
  readonly domainCoverageGrowthRate: number;

  /** Whether the learning rate is accelerating, steady, or decelerating. */
  readonly trajectory: MetricTrend;
}

/**
 * Direction of metric change between snapshots.
 */
export type MetricTrend =
  | "improving"     // Metric is getting better
  | "stable"        // Metric is roughly unchanged
  | "declining";    // Metric is getting worse

// ---------------------------------------------------------------------------
// Flywheel health monitoring
// ---------------------------------------------------------------------------

/**
 * Overall pipeline health status.
 */
export type PipelineHealthStatus =
  | "healthy"           // All subsystems producing and consuming signals
  | "degraded"          // One or more subsystems stalled but pipeline functional
  | "stalled"           // Multiple subsystems not producing signals
  | "critical";         // Pipeline is not functioning — no learning occurring

/**
 * IFlywheelHealthAlert — a diagnostic alert when a learning subsystem
 * stalls or degrades.
 *
 * The health monitor detects:
 * - Subsystems that stop producing signals (trail stall, playbook stall, etc.)
 * - Calibration quality degradation (ECE increasing over time)
 * - Knowledge base growth stall (no new trails or patterns)
 * - Routing optimization stall (phase not progressing despite build count)
 *
 * Spec Section 10.4 — the flywheel must be monitored to ensure it continues
 *   to compound intelligence across builds.
 */
export interface IFlywheelHealthAlert {
  /** Unique alert identifier. */
  readonly id: string;

  /** Which subsystem is affected. */
  readonly subsystem: LearningSignalCategory | "pipeline-overall";

  /** Severity of the health issue. */
  readonly severity: FlywheelAlertSeverity;

  /** Human-readable description of the issue. */
  readonly description: string;

  /** Diagnostic data for investigation. */
  readonly diagnostics: IFlywheelDiagnostic;

  /** Recommended action to resolve the issue. */
  readonly recommendation: string;

  /** When this alert was raised. */
  readonly raisedAt: Date;
}

/**
 * Severity of a flywheel health alert.
 */
export type FlywheelAlertSeverity =
  | "info"        // Informational — subsystem is functioning but suboptimally
  | "warning"     // Warning — subsystem may stall if trend continues
  | "critical";   // Critical — subsystem has stalled, learning not occurring

/**
 * Diagnostic data attached to a health alert.
 */
export interface IFlywheelDiagnostic {
  /** Number of builds since last signal from this subsystem. */
  readonly buildsSinceLastSignal: number;

  /** Time since last signal from this subsystem. */
  readonly timeSinceLastSignalMs: number;

  /** Expected signals per build for this subsystem. */
  readonly expectedSignalsPerBuild: number;

  /** Actual signals per build over the diagnostic window. */
  readonly actualSignalsPerBuild: number;

  /** The metric that triggered the alert, if applicable. */
  readonly triggeringMetric: string | null;

  /** The threshold that was exceeded, if applicable. */
  readonly threshold: number | null;

  /** The actual value that exceeded the threshold. */
  readonly actualValue: number | null;
}

// ---------------------------------------------------------------------------
// Service interfaces
// ---------------------------------------------------------------------------

/**
 * IBuildCompletionLearningCollector — collects all learning signals from
 * a completed build into a unified bundle.
 *
 * Called at the end of every build, this service queries each learning
 * subsystem for its contribution and assembles an IBuildLearningBundle.
 *
 * Spec Section 10.4 — "The continuous learning pipeline captures everything."
 * Spec Section 12.4, Step 26 — Build Completion Learning Collector.
 */
export interface IBuildCompletionLearningCollector {
  /**
   * Collect all learning signals from a completed build.
   *
   * Queries each subsystem for its learning contribution and assembles
   * a complete IBuildLearningBundle. This is the entry point for the
   * flywheel — called once per build at completion.
   *
   * @param buildId — the completed build's ID
   * @param buildOutcome — the build's outcome summary
   * @param domainClassification — the build's domain classification (may be null for unclassified builds)
   */
  collect(
    buildId: string,
    buildOutcome: IBuildOutcome,
    domainClassification: IDomainClassification | null,
  ): Promise<IBuildLearningBundle>;
}

/**
 * Dependencies for the BuildCompletionLearningCollector.
 *
 * Each dependency provides learning data from one subsystem.
 * The collector queries all of them to assemble the complete bundle.
 */
export interface IBuildCompletionLearningCollectorDeps {
  /** Query trails extracted during this build. */
  readonly queryBuildTrails: (buildId: string) => Promise<readonly ITrailEntry[]>;

  /** Query playbook evolutions from this build. */
  readonly queryPlaybookEvolutions: (buildId: string) => Promise<IPlaybookEvolutionPayload>;

  /** Query anti-pattern inferences from this build. */
  readonly queryAntiPatternInferences: (buildId: string) => Promise<IAntiPatternInferencePayload>;

  /** Query cross-build pattern updates from this build. */
  readonly queryCrossBuildPatterns: (buildId: string) => Promise<ICrossBuildPatternPayload>;

  /** Query confidence calibration data from this build. */
  readonly queryConfidenceCalibration: (buildId: string) => Promise<IConfidenceCalibrationPayload>;

  /** Query design scoring calibration data from this build. */
  readonly queryDesignScoringCalibration: (buildId: string) => Promise<IDesignScoringCalibrationPayload>;

  /** Query routing outcomes from this build. */
  readonly queryRoutingOutcomes: (buildId: string) => Promise<IRoutingOutcomePayload>;

  /** Query UX verification results from this build (may be null if not verified). */
  readonly queryUXVerification: (buildId: string) => Promise<IUXVerificationResult | null>;

  /** Query intent satisfaction results from this build (may be null if not measured). */
  readonly queryIntentSatisfaction: (buildId: string) => Promise<IIntentSatisfactionResult | null>;
}

/**
 * ILearningSignalRouter — routes each learning signal from a build
 * bundle to the appropriate subsystem for processing.
 *
 * The router is the dispatch layer of the flywheel. It takes the
 * assembled bundle and feeds each signal to its target:
 * - Trail signals → Librarian
 * - Pattern signals → CrossBuildPatternAnalyzer
 * - Playbook signals → PlaybookEvolver
 * - Calibration signals → respective trackers
 * - Routing signals → RoutingMetricsTracker
 * - Anti-pattern signals → AntiPatternLibrary
 * - Domain knowledge → DomainKnowledgeCurator
 *
 * Spec Section 12.4, Step 26 — Learning Signal Router.
 */
export interface ILearningSignalRouter {
  /**
   * Route all signals in a build learning bundle to their target subsystems.
   *
   * Processes signals sequentially within each category (order matters for
   * some subsystems like trail storage), but categories are independent.
   *
   * @param bundle — the complete build learning bundle
   */
  routeBundle(bundle: IBuildLearningBundle): Promise<IBundleRoutingResult>;
}

/**
 * Dependencies for the LearningSignalRouter.
 *
 * Each dependency represents a target subsystem that consumes
 * learning signals.
 */
export interface ILearningSignalRouterDeps {
  /** Store new trails in the knowledge base. */
  readonly storeTrails: (trails: readonly ITrailEntry[]) => Promise<void>;

  /** Process playbook evolution signals. */
  readonly processPlaybookEvolution: (payload: IPlaybookEvolutionPayload) => Promise<void>;

  /** Process anti-pattern inference signals. */
  readonly processAntiPatterns: (payload: IAntiPatternInferencePayload) => Promise<void>;

  /** Process cross-build pattern signals. */
  readonly processCrossBuildPatterns: (payload: ICrossBuildPatternPayload) => Promise<void>;

  /** Record confidence calibration data points. */
  readonly recordConfidenceCalibration: (payload: IConfidenceCalibrationPayload) => Promise<void>;

  /** Record design scoring calibration data. */
  readonly recordDesignScoringCalibration: (payload: IDesignScoringCalibrationPayload) => Promise<void>;

  /** Record routing outcomes. */
  readonly recordRoutingOutcomes: (payload: IRoutingOutcomePayload) => Promise<void>;

  /** Process UX verification results for learning. */
  readonly processUXVerification: (payload: IUXVerificationPayload) => Promise<void>;

  /** Process intent satisfaction results for learning. */
  readonly processIntentSatisfaction: (payload: IIntentSatisfactionPayload) => Promise<void>;

  /** Record the build's knowledge contribution for compounding metrics. */
  readonly recordKnowledgeContribution: (buildId: string, contribution: IBuildKnowledgeContribution) => void;

  /** Process domain-level knowledge curation. */
  readonly processDomainContribution: (
    buildOutcome: IBuildOutcome,
    classification: IDomainClassification,
    playbooks: readonly IPlaybook[],
  ) => void;
}

/**
 * IFlywheelMetricsDashboard — computes and tracks the flywheel's
 * compounding intelligence metrics.
 *
 * Provides the metrics that prove the system is getting smarter with
 * each build: knowledge base growth, prediction accuracy improvement,
 * routing optimization, and design score calibration.
 *
 * Spec Section 1.2, Principle 5 — "After 10,000 builds, a new entrant
 *   would need to replicate not just the architecture but the accumulated
 *   knowledge of 10,000 real projects."
 * Spec Section 6.7 — routing trajectory across four phases.
 * Spec Section 12.4, Step 26 — Flywheel Metrics Dashboard.
 */
export interface IFlywheelMetricsDashboard {
  /**
   * Compute a comprehensive metrics snapshot.
   *
   * Queries all subsystems for their current state and produces a
   * unified view of the flywheel's compounding trajectory.
   */
  computeSnapshot(): IFlywheelMetricsSnapshot;

  /**
   * Record the outcome of routing a build learning bundle.
   *
   * Used to track per-build learning rates and detect trends.
   *
   * @param result — the bundle routing result
   */
  recordBundleResult(result: IBundleRoutingResult): void;

  /**
   * Get the history of metrics snapshots for trend analysis.
   *
   * @param limit — maximum number of snapshots to return (default: 20)
   */
  getSnapshotHistory(limit?: number): readonly IFlywheelMetricsSnapshot[];

  /**
   * Get the current routing phase and the build count needed to
   * reach the next phase.
   *
   * Spec Section 6.7 — routing phases driven by build count.
   */
  getRoutingPhaseProgress(): IRoutingPhaseProgress;
}

/**
 * Routing phase progression — where we are on the four-phase trajectory.
 *
 * Spec Section 6.7:
 * - Phase 1 (1-100): Most goals → Opus. Sparse trails. High cost.
 * - Phase 2 (100-500): Well-understood types → Sonnet + trails. Cost drops 40-60%.
 * - Phase 3 (500-2000): Most types → Sonnet. Opus for novel work.
 * - Phase 4 (2000+): Knowledge base is the primary asset.
 */
export interface IRoutingPhaseProgress {
  /** Current routing phase. */
  readonly currentPhase: RoutingPhase;

  /** Total builds completed. */
  readonly totalBuilds: number;

  /** Builds needed to reach next phase (null if Phase 4). */
  readonly buildsToNextPhase: number | null;

  /** Sonnet routing rate at current build count. */
  readonly currentSonnetRate: number;

  /** Estimated cost savings vs. all-Opus routing (0-1). */
  readonly estimatedCostSavings: number;
}

/**
 * Dependencies for the FlywheelMetricsDashboard.
 */
export interface IFlywheelMetricsDashboardDeps {
  /** Get knowledge health snapshot from KnowledgeCompoundingMetrics. */
  readonly getKnowledgeHealth: () => IKnowledgeHealthSnapshot;

  /** Get confidence calibration summary. */
  readonly getConfidenceCalibrationSummary: () => ICalibrationMetricsSummary;

  /** Get design scoring calibration summary. */
  readonly getDesignCalibrationSummary: () => IDesignCalibrationMetricsSummary;

  /** Get routing metrics summary. */
  readonly getRoutingMetrics: () => IRoutingMetricsSummary;
}

/**
 * IFlywheelHealthMonitor — monitors the continuous learning pipeline
 * for stalls, degradation, and anomalies.
 *
 * Detects when subsystems stop producing learning signals, when
 * calibration quality degrades, when knowledge growth stalls, or when
 * routing optimization plateaus. Produces diagnostic alerts with
 * actionable recommendations.
 *
 * Spec Section 12.4, Step 26 — Flywheel Health Monitor.
 */
export interface IFlywheelHealthMonitor {
  /**
   * Run a health check across all flywheel subsystems.
   *
   * Compares current metrics against expected baselines and raises
   * alerts for any subsystem that shows signs of stalling or degradation.
   *
   * @param currentSnapshot — the current flywheel metrics snapshot
   * @param previousSnapshot — the previous snapshot (for trend detection)
   */
  checkHealth(
    currentSnapshot: IFlywheelMetricsSnapshot,
    previousSnapshot: IFlywheelMetricsSnapshot | null,
  ): IFlywheelHealthCheckResult;

  /**
   * Record a signal event for staleness detection.
   *
   * Called each time a learning signal is successfully routed.
   * The monitor tracks time-since-last-signal per category.
   *
   * @param category — which subsystem produced the signal
   * @param buildId — which build produced the signal
   */
  recordSignalEvent(category: LearningSignalCategory, buildId: string): void;

  /**
   * Get the current pipeline health status.
   */
  getStatus(): PipelineHealthStatus;

  /**
   * Get all currently active health alerts.
   */
  getActiveAlerts(): readonly IFlywheelHealthAlert[];
}

/**
 * Result of a flywheel health check.
 */
export interface IFlywheelHealthCheckResult {
  /** Overall pipeline health. */
  readonly status: PipelineHealthStatus;

  /** New alerts raised by this check. */
  readonly newAlerts: readonly IFlywheelHealthAlert[];

  /** Alerts resolved since the last check. */
  readonly resolvedAlertIds: readonly string[];

  /** Per-subsystem health status. */
  readonly subsystemHealth: Readonly<Record<LearningSignalCategory, SubsystemHealthStatus>>;

  /** When this check was performed. */
  readonly checkedAt: Date;
}

/**
 * Health status for a single learning subsystem.
 */
export interface SubsystemHealthStatus {
  /** Whether this subsystem is producing signals. */
  readonly producing: boolean;

  /** Builds since last signal from this subsystem. */
  readonly buildsSinceLastSignal: number;

  /** Signals per build over the last 10 builds. */
  readonly signalsPerBuild: number;

  /** Whether this subsystem's output quality is acceptable. */
  readonly qualityAcceptable: boolean;

  /** Status assessment. */
  readonly status: "healthy" | "degraded" | "stalled";
}

/**
 * Configuration for flywheel health monitoring thresholds.
 */
export interface IFlywheelHealthConfig {
  /**
   * Maximum builds without a signal before raising a warning.
   * Default: 3 builds.
   */
  readonly maxBuildsSilentWarning: number;

  /**
   * Maximum builds without a signal before raising a critical alert.
   * Default: 10 builds.
   */
  readonly maxBuildsSilentCritical: number;

  /**
   * Minimum expected signals per build for trail extraction.
   * Default: 1 (every build should produce at least one trail).
   */
  readonly minTrailsPerBuild: number;

  /**
   * ECE improvement threshold — if ECE increases by more than this
   * between snapshots, raise a calibration degradation alert.
   * Default: 0.03 (confidence) / 3 (design scoring).
   */
  readonly eceRegressionThreshold: number;

  /**
   * Minimum builds before health monitoring becomes active.
   * Default: 5 (need baseline data before meaningful alerts).
   */
  readonly warmUpBuilds: number;
}
