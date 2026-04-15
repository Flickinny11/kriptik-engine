/**
 * RoutingDecisionEngine — decides whether a goal should be assigned to
 * Opus 4.6 or Sonnet 4.6 based on coverage density, task complexity,
 * and the current routing phase.
 *
 * The core insight from the spec: the routing decision isn't just
 * "how complex is the task?" but "how complex is the task GIVEN the
 * trail coverage available?"
 *
 * Spec Section 6.7 — Model Tier Optimization via Routing
 * Spec Section 3.4 — Model Tier Determined by Routing, Not Pairing
 */

import type {
  ModelTier,
  ICoverageDensityCalculator,
  IRoutingDecisionEngine,
  IRoutingDecision,
  IRoutingMetricsTracker,
  ITaskComplexitySignals,
  RoutingPhase,
  TaskComplexity,
} from "@kriptik/shared-interfaces";

/**
 * Phase boundaries from Spec Section 6.7.
 */
const PHASE_BOUNDARIES = {
  phase2Start: 100,
  phase3Start: 500,
  phase4Start: 2000,
} as const;

/**
 * Coverage density thresholds per routing phase.
 *
 * In early phases, the threshold for Sonnet routing is higher because
 * the knowledge base is less mature. As the system accumulates more
 * builds, lower coverage thresholds become acceptable because the
 * overall knowledge quality improves.
 */
const SONNET_COVERAGE_THRESHOLDS: Record<RoutingPhase, number> = {
  1: 0.85,  // Phase 1: very high bar — almost never routes to Sonnet
  2: 0.65,  // Phase 2: well-understood types start routing to Sonnet
  3: 0.50,  // Phase 3: most common types route to Sonnet
  4: 0.40,  // Phase 4: knowledge base is the primary asset
};

/**
 * Complexity scoring for task complexity signals.
 * Each signal adds to a complexity score; the total determines the
 * TaskComplexity classification.
 */
const COMPLEXITY_SIGNAL_WEIGHTS = {
  dependencyCount: 0.15,
  interfaceContractCount: 0.15,
  downstreamDependentCount: 0.15,
  hasExternalAPIs: 0.20,
  hasSecurityPatterns: 0.20,
  isNovelTaskType: 0.15,
} as const;

const COMPLEXITY_THRESHOLDS = {
  low: 0.25,
  medium: 0.50,
  high: 0.75,
} as const;

export class RoutingDecisionEngine implements IRoutingDecisionEngine {
  constructor(
    private readonly coverageCalculator: ICoverageDensityCalculator,
    private readonly metricsTracker: IRoutingMetricsTracker,
  ) {}

  async route(
    goalId: string,
    taskType: string,
    complexitySignals: ITaskComplexitySignals,
  ): Promise<IRoutingDecision> {
    const phase = this.getCurrentPhase();
    const coverage = await this.coverageCalculator.computeCoverage(taskType);
    const complexity = this.assessComplexity(complexitySignals);

    const { tier, confidence, reasoning } = this.decide(
      phase,
      coverage.compositeDensity,
      coverage.hasRichCoverage,
      complexity,
      complexitySignals.isNovelTaskType,
    );

    const allowEscalation = tier === "claude-sonnet-4-6";

    const decision: IRoutingDecision = {
      goalId,
      taskType,
      assignedTier: tier,
      coverage,
      complexity,
      routingPhase: phase,
      confidence,
      reasoning,
      allowEscalation,
      decidedAt: new Date(),
    };

    this.metricsTracker.recordDecision(decision);

    return decision;
  }

  getCurrentPhase(): RoutingPhase {
    const totalBuilds = this.metricsTracker.getTotalBuilds();

    if (totalBuilds >= PHASE_BOUNDARIES.phase4Start) return 4;
    if (totalBuilds >= PHASE_BOUNDARIES.phase3Start) return 3;
    if (totalBuilds >= PHASE_BOUNDARIES.phase2Start) return 2;
    return 1;
  }

  private decide(
    phase: RoutingPhase,
    compositeDensity: number,
    hasRichCoverage: boolean,
    complexity: TaskComplexity,
    isNovelTaskType: boolean,
  ): { tier: ModelTier; confidence: number; reasoning: string } {
    // Novel task types always route to Opus — no knowledge to compensate.
    if (isNovelTaskType) {
      return {
        tier: "claude-opus-4-6",
        confidence: 0.95,
        reasoning: `Novel task type with no prior builds. Opus 4.6 required for first-attempt quality. Phase ${phase}.`,
      };
    }

    // High complexity with sparse coverage always routes to Opus.
    if (complexity === "high" && !hasRichCoverage) {
      return {
        tier: "claude-opus-4-6",
        confidence: 0.90,
        reasoning: `High complexity task with insufficient trail coverage (density: ${compositeDensity.toFixed(2)}). Opus 4.6 for maximum reasoning. Phase ${phase}.`,
      };
    }

    // Novel complexity always routes to Opus regardless of coverage.
    if (complexity === "novel") {
      return {
        tier: "claude-opus-4-6",
        confidence: 0.90,
        reasoning: `Novel complexity level indicates frontier work. Opus 4.6 required regardless of coverage. Phase ${phase}.`,
      };
    }

    // Phase-aware coverage threshold check for Sonnet routing.
    const threshold = SONNET_COVERAGE_THRESHOLDS[phase];

    if (compositeDensity >= threshold) {
      const qualityDelta = compositeDensity - threshold;
      const confidence = Math.min(0.70 + qualityDelta * 0.5, 0.95);

      return {
        tier: "claude-sonnet-4-6",
        confidence,
        reasoning: `Coverage density ${compositeDensity.toFixed(2)} exceeds Phase ${phase} threshold ${threshold.toFixed(2)}. Rich trail injection compensates for reduced reasoning depth. Escalation enabled if uncertainty signals spike.`,
      };
    }

    // Below threshold — route to Opus with coverage-informed confidence.
    const headroom = threshold - compositeDensity;
    const confidence = Math.min(0.75 + headroom * 0.3, 0.95);

    return {
      tier: "claude-opus-4-6",
      confidence,
      reasoning: `Coverage density ${compositeDensity.toFixed(2)} below Phase ${phase} threshold ${threshold.toFixed(2)}. Opus 4.6 for ${complexity} complexity task until trail coverage matures.`,
    };
  }

  private assessComplexity(signals: ITaskComplexitySignals): TaskComplexity {
    const depScore = Math.min(signals.dependencyCount / 10, 1.0);
    const contractScore = Math.min(signals.interfaceContractCount / 5, 1.0);
    const downstreamScore = Math.min(signals.downstreamDependentCount / 5, 1.0);
    const apiScore = signals.hasExternalAPIs ? 1.0 : 0.0;
    const securityScore = signals.hasSecurityPatterns ? 1.0 : 0.0;
    const novelScore = signals.isNovelTaskType ? 1.0 : 0.0;

    const composite =
      COMPLEXITY_SIGNAL_WEIGHTS.dependencyCount * depScore +
      COMPLEXITY_SIGNAL_WEIGHTS.interfaceContractCount * contractScore +
      COMPLEXITY_SIGNAL_WEIGHTS.downstreamDependentCount * downstreamScore +
      COMPLEXITY_SIGNAL_WEIGHTS.hasExternalAPIs * apiScore +
      COMPLEXITY_SIGNAL_WEIGHTS.hasSecurityPatterns * securityScore +
      COMPLEXITY_SIGNAL_WEIGHTS.isNovelTaskType * novelScore;

    if (signals.isNovelTaskType && composite > COMPLEXITY_THRESHOLDS.medium) {
      return "novel";
    }
    if (composite > COMPLEXITY_THRESHOLDS.high) return "high";
    if (composite > COMPLEXITY_THRESHOLDS.medium) return "medium";
    if (composite > COMPLEXITY_THRESHOLDS.low) return "low";
    return "low";
  }
}
