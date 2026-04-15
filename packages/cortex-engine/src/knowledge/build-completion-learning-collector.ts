/**
 * BuildCompletionLearningCollector — collects all learning signals from
 * a completed build into a unified IBuildLearningBundle.
 *
 * This is the entry point of the continuous learning flywheel. At the
 * end of every build, this collector queries each learning subsystem
 * for its contribution and assembles the complete bundle that the
 * LearningSignalRouter will process.
 *
 * Spec Section 10.4 — "The continuous learning pipeline captures everything:
 *   golden window telemetry, decision records, UX test results, intent
 *   accuracy metrics, design scores, and rotation outcomes."
 * Spec Section 12.4, Step 26 — Build Completion Learning Collector.
 */

import type {
  IBuildCompletionLearningCollector,
  IBuildCompletionLearningCollectorDeps,
  IBuildLearningBundle,
  ILearningSignal,
  LearningSignalCategory,
  ITrailExtractionPayload,
} from "@kriptik/shared-interfaces";

import type {
  IBuildOutcome,
} from "@kriptik/shared-interfaces";

import type {
  IDomainClassification,
} from "@kriptik/shared-interfaces";

import type { TrailOutcome } from "@kriptik/shared-interfaces";

/**
 * Assembles a complete IBuildLearningBundle by querying all learning
 * subsystems at build completion.
 *
 * The collector is agnostic to the processing of signals — it only
 * gathers them. The LearningSignalRouter handles dispatch.
 */
export class BuildCompletionLearningCollector implements IBuildCompletionLearningCollector {
  private nextSignalId = 0;

  constructor(private readonly deps: IBuildCompletionLearningCollectorDeps) {}

  async collect(
    buildId: string,
    buildOutcome: IBuildOutcome,
    domainClassification: IDomainClassification | null,
  ): Promise<IBuildLearningBundle> {
    const collectionStartedAt = new Date();
    const signals: ILearningSignal[] = [];

    // Collect from all subsystems in parallel where possible.
    // Each query is independent, so we can parallelize.
    const [
      trails,
      playbookEvolution,
      antiPatternInference,
      crossBuildPatterns,
      confidenceCalibration,
      designScoringCalibration,
      routingOutcomes,
      uxVerification,
      intentSatisfaction,
    ] = await Promise.all([
      this.deps.queryBuildTrails(buildId),
      this.deps.queryPlaybookEvolutions(buildId),
      this.deps.queryAntiPatternInferences(buildId),
      this.deps.queryCrossBuildPatterns(buildId),
      this.deps.queryConfidenceCalibration(buildId),
      this.deps.queryDesignScoringCalibration(buildId),
      this.deps.queryRoutingOutcomes(buildId),
      this.deps.queryUXVerification(buildId),
      this.deps.queryIntentSatisfaction(buildId),
    ]);

    const now = new Date();

    // Trail extraction signal
    if (trails.length > 0) {
      const countByType: Record<string, number> = {};
      const countByOutcome: Record<string, number> = {};
      for (const trail of trails) {
        countByType[trail.trailType] = (countByType[trail.trailType] ?? 0) + 1;
        countByOutcome[trail.outcome] = (countByOutcome[trail.outcome] ?? 0) + 1;
      }
      const payload: ITrailExtractionPayload = {
        type: "trail-extraction",
        trails,
        countByType,
        countByOutcome: countByOutcome as Record<TrailOutcome, number>,
      };
      signals.push(this.createSignal("trail-extraction", buildId, now, payload));
    }

    // Playbook evolution signal
    if (
      playbookEvolution.newPlaybooks.length > 0 ||
      playbookEvolution.reinforcedPlaybookIds.length > 0 ||
      playbookEvolution.deprecatedPlaybookIds.length > 0 ||
      playbookEvolution.mergedPlaybookIds.length > 0
    ) {
      signals.push(this.createSignal("playbook-evolution", buildId, now, playbookEvolution));
    }

    // Anti-pattern inference signal
    if (
      antiPatternInference.newAntiPatterns.length > 0 ||
      antiPatternInference.reinforcedAntiPatternIds.length > 0
    ) {
      signals.push(this.createSignal("anti-pattern-inference", buildId, now, antiPatternInference));
    }

    // Cross-build pattern signal
    if (
      crossBuildPatterns.newPatterns.length > 0 ||
      crossBuildPatterns.confirmedPatternIds.length > 0 ||
      crossBuildPatterns.promotedPatternIds.length > 0
    ) {
      signals.push(this.createSignal("cross-build-pattern", buildId, now, crossBuildPatterns));
    }

    // Confidence calibration signal
    if (confidenceCalibration.dataPoints.length > 0 || confidenceCalibration.unmatchedPredictionCount > 0) {
      signals.push(this.createSignal("confidence-calibration", buildId, now, confidenceCalibration));
    }

    // Design scoring calibration signal
    if (designScoringCalibration.prediction !== null || designScoringCalibration.dataPoints.length > 0) {
      signals.push(this.createSignal("design-scoring-calibration", buildId, now, designScoringCalibration));
    }

    // Routing outcome signal
    if (routingOutcomes.outcomes.length > 0) {
      signals.push(this.createSignal("routing-outcome", buildId, now, routingOutcomes));
    }

    // UX verification signal
    if (uxVerification !== null) {
      signals.push(this.createSignal("ux-verification", buildId, now, {
        type: "ux-verification",
        result: uxVerification,
      }));
    }

    // Intent satisfaction signal
    if (intentSatisfaction !== null) {
      signals.push(this.createSignal("intent-satisfaction", buildId, now, {
        type: "intent-satisfaction",
        result: intentSatisfaction,
      }));
    }

    // Compute signal counts by category
    const signalCounts = this.computeSignalCounts(signals);

    return {
      buildId,
      domainClassification,
      signals,
      signalCounts,
      collectionStartedAt,
      collectionCompletedAt: new Date(),
      buildOutcome,
    };
  }

  private createSignal(
    category: LearningSignalCategory,
    buildId: string,
    collectedAt: Date,
    payload: ILearningSignal["payload"],
  ): ILearningSignal {
    return {
      id: `signal-${buildId}-${category}-${this.nextSignalId++}`,
      category,
      buildId,
      collectedAt,
      payload,
    };
  }

  private computeSignalCounts(
    signals: readonly ILearningSignal[],
  ): Record<LearningSignalCategory, number> {
    const counts: Record<string, number> = {
      "trail-extraction": 0,
      "playbook-evolution": 0,
      "anti-pattern-inference": 0,
      "cross-build-pattern": 0,
      "confidence-calibration": 0,
      "design-scoring-calibration": 0,
      "routing-outcome": 0,
      "ux-verification": 0,
      "intent-satisfaction": 0,
    };
    for (const signal of signals) {
      counts[signal.category] = (counts[signal.category] ?? 0) + 1;
    }
    return counts as Record<LearningSignalCategory, number>;
  }
}
