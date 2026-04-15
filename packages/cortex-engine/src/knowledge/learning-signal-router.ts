/**
 * LearningSignalRouter — routes each learning signal from a build
 * learning bundle to the appropriate subsystem for processing.
 *
 * The router is the dispatch layer of the continuous learning flywheel.
 * It takes the assembled bundle and feeds each signal to its target:
 * - Trail signals → Librarian (storage + vector indexing)
 * - Pattern signals → CrossBuildPatternAnalyzer (statistical analysis)
 * - Playbook signals → PlaybookEvolver (evolution processing)
 * - Confidence calibration → PredictionAccuracyTracker (curve computation)
 * - Design scoring calibration → DesignScoreAccuracyTracker (curve computation)
 * - Routing outcomes → RoutingMetricsTracker (phase progression)
 * - Anti-patterns → AntiPatternLibrary (library updates)
 * - Domain knowledge → DomainKnowledgeCurator (domain playbook curation)
 * - UX/Intent signals → learning feedback for ICE refinement
 *
 * Spec Section 12.4, Step 26 — Learning Signal Router.
 */

import type {
  ILearningSignalRouter,
  ILearningSignalRouterDeps,
  IBuildLearningBundle,
  IBundleRoutingResult,
  ISignalRoutingResult,
  ILearningSignal,
  ITrailExtractionPayload,
  IPlaybookEvolutionPayload,
  IAntiPatternInferencePayload,
  ICrossBuildPatternPayload,
  IConfidenceCalibrationPayload,
  IDesignScoringCalibrationPayload,
  IRoutingOutcomePayload,
  IUXVerificationPayload,
  IIntentSatisfactionPayload,
  IBuildKnowledgeContribution,
} from "@kriptik/shared-interfaces";

/**
 * Routes learning signals to their target subsystems and assembles
 * a knowledge contribution summary.
 *
 * Signals within each category are processed sequentially (order matters
 * for trail storage), but independent categories could be parallelized
 * in a future optimization.
 */
export class LearningSignalRouter implements ILearningSignalRouter {
  constructor(private readonly deps: ILearningSignalRouterDeps) {}

  async routeBundle(bundle: IBuildLearningBundle): Promise<IBundleRoutingResult> {
    const startTime = Date.now();
    const signalResults: ISignalRoutingResult[] = [];

    // Track knowledge contribution as we route
    const contribution: MutableContribution = {
      newTrails: 0,
      validatedTrails: 0,
      newPlaybooks: 0,
      reinforcedPlaybooks: 0,
      newAntiPatterns: 0,
      newCrossBuildPatterns: 0,
      newTaskTypes: 0,
      domain: bundle.domainClassification?.effectiveDomain ?? null,
      evaluatorScore: null,
      firstPassSuccess: false,
      contributedAt: new Date(),
    };

    // Route each signal to its target subsystem
    for (const signal of bundle.signals) {
      const result = await this.routeSignal(signal, bundle, contribution);
      signalResults.push(result);
    }

    // Derive evaluator score and first-pass success from build outcome
    contribution.evaluatorScore = bundle.buildOutcome.evaluatorScore ?? null;
    contribution.firstPassSuccess = bundle.buildOutcome.outcome === "passed_first_pass";

    // Record the knowledge contribution
    const knowledgeContribution: IBuildKnowledgeContribution = { ...contribution };
    this.deps.recordKnowledgeContribution(bundle.buildId, knowledgeContribution);

    // Process domain contribution if classified
    if (bundle.domainClassification?.effectiveDomain !== null && bundle.domainClassification !== null) {
      const newPlaybooks = this.extractNewPlaybooks(bundle);
      this.deps.processDomainContribution(
        bundle.buildOutcome,
        bundle.domainClassification,
        newPlaybooks,
      );
    }

    const successCount = signalResults.filter(r => r.success).length;
    const failureCount = signalResults.filter(r => !r.success).length;

    return {
      buildId: bundle.buildId,
      signalResults,
      successCount,
      failureCount,
      totalProcessingTimeMs: Date.now() - startTime,
      knowledgeContribution,
      completedAt: new Date(),
    };
  }

  private async routeSignal(
    signal: ILearningSignal,
    bundle: IBuildLearningBundle,
    contribution: MutableContribution,
  ): Promise<ISignalRoutingResult> {
    const startTime = Date.now();
    try {
      switch (signal.payload.type) {
        case "trail-extraction":
          await this.routeTrailExtraction(signal.payload, contribution);
          break;
        case "playbook-evolution":
          await this.routePlaybookEvolution(signal.payload, contribution);
          break;
        case "anti-pattern-inference":
          await this.routeAntiPatternInference(signal.payload, contribution);
          break;
        case "cross-build-pattern":
          await this.routeCrossBuildPatterns(signal.payload, contribution);
          break;
        case "confidence-calibration":
          await this.routeConfidenceCalibration(signal.payload);
          break;
        case "design-scoring-calibration":
          await this.routeDesignScoringCalibration(signal.payload);
          break;
        case "routing-outcome":
          await this.routeRoutingOutcomes(signal.payload);
          break;
        case "ux-verification":
          await this.routeUXVerification(signal.payload);
          break;
        case "intent-satisfaction":
          await this.routeIntentSatisfaction(signal.payload);
          break;
      }

      return {
        signalId: signal.id,
        category: signal.category,
        success: true,
        error: null,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        signalId: signal.id,
        category: signal.category,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  private async routeTrailExtraction(
    payload: ITrailExtractionPayload,
    contribution: MutableContribution,
  ): Promise<void> {
    await this.deps.storeTrails(payload.trails);
    contribution.newTrails += payload.trails.length;
    // Count new task types by tracking unique types in this batch
    const taskTypes = new Set(payload.trails.map(t => t.taskType));
    contribution.newTaskTypes += taskTypes.size;
  }

  private async routePlaybookEvolution(
    payload: IPlaybookEvolutionPayload,
    contribution: MutableContribution,
  ): Promise<void> {
    await this.deps.processPlaybookEvolution(payload);
    contribution.newPlaybooks += payload.newPlaybooks.length;
    contribution.reinforcedPlaybooks += payload.reinforcedPlaybookIds.length;
  }

  private async routeAntiPatternInference(
    payload: IAntiPatternInferencePayload,
    contribution: MutableContribution,
  ): Promise<void> {
    await this.deps.processAntiPatterns(payload);
    contribution.newAntiPatterns += payload.newAntiPatterns.length;
  }

  private async routeCrossBuildPatterns(
    payload: ICrossBuildPatternPayload,
    contribution: MutableContribution,
  ): Promise<void> {
    await this.deps.processCrossBuildPatterns(payload);
    contribution.newCrossBuildPatterns += payload.newPatterns.length;
  }

  private async routeConfidenceCalibration(
    payload: IConfidenceCalibrationPayload,
  ): Promise<void> {
    await this.deps.recordConfidenceCalibration(payload);
  }

  private async routeDesignScoringCalibration(
    payload: IDesignScoringCalibrationPayload,
  ): Promise<void> {
    await this.deps.recordDesignScoringCalibration(payload);
  }

  private async routeRoutingOutcomes(
    payload: IRoutingOutcomePayload,
  ): Promise<void> {
    await this.deps.recordRoutingOutcomes(payload);
  }

  private async routeUXVerification(
    payload: IUXVerificationPayload,
  ): Promise<void> {
    await this.deps.processUXVerification(payload);
  }

  private async routeIntentSatisfaction(
    payload: IIntentSatisfactionPayload,
  ): Promise<void> {
    await this.deps.processIntentSatisfaction(payload);
  }

  /**
   * Extract new playbooks from the bundle for domain curation.
   */
  private extractNewPlaybooks(bundle: IBuildLearningBundle): readonly import("@kriptik/shared-interfaces").IPlaybook[] {
    for (const signal of bundle.signals) {
      if (signal.payload.type === "playbook-evolution") {
        return signal.payload.newPlaybooks;
      }
    }
    return [];
  }
}

/**
 * Mutable version of IBuildKnowledgeContribution used during accumulation.
 */
interface MutableContribution {
  newTrails: number;
  validatedTrails: number;
  newPlaybooks: number;
  reinforcedPlaybooks: number;
  newAntiPatterns: number;
  newCrossBuildPatterns: number;
  newTaskTypes: number;
  domain: string | null;
  evaluatorScore: number | null;
  firstPassSuccess: boolean;
  contributedAt: Date;
}
