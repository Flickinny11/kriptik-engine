/**
 * CVS Coordinator — orchestrates the full Continuous Verification Stack.
 *
 * Coordinates all verification subsystems to produce the final completeness
 * assessment that determines whether a build is "done" per spec Section 10.1.
 *
 * Verification layers orchestrated:
 * 1. Anti-slop linting (already enforced per-merge at the merge gate)
 * 2. UX Verification Teams (Navigator + Inspector, already executed)
 * 3. Journey Verification (all spec journeys tested and passing)
 * 4. Intent Satisfaction (build matches original prompt including unstated needs)
 * 5. Design Quality Scoring (meets user-adjustable threshold)
 * 6. Integration checks (types, lint, tests — reported via artifacts)
 *
 * Phase C, Step 15 — Journey and Intent Verification Agents
 * Spec Section 10.1 — What "Done" Means.
 */

import type {
  ICVSCoordinator,
  ICVSCoordinatorConfig,
  ICVSResult,
  IJourneyVerificationResult,
  IJourneyVerificationAgent,
  IIntentSatisfactionResult,
  IIntentSatisfactionAgent,
  ILivingSpecification,
  IBuildArtifactsSummary,
  IUXVerificationResult,
  IUXIssue,
  IDesignQualityScore,
  IUserJourney,
} from "@kriptik/shared-interfaces";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Dependencies injected into the CVS Coordinator. */
export interface CVSCoordinatorDeps {
  /** The Journey Verification Agent instance. */
  readonly journeyAgent: IJourneyVerificationAgent;
  /** The Intent Satisfaction Agent instance. */
  readonly intentAgent: IIntentSatisfactionAgent;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class CVSCoordinator implements ICVSCoordinator {
  readonly buildId: string;

  private readonly appUrl: string;
  private readonly designQualityThreshold: number;
  private readonly journeyAgent: IJourneyVerificationAgent;
  private readonly intentAgent: IIntentSatisfactionAgent;

  private journeyResult: IJourneyVerificationResult | null = null;
  private intentResult: IIntentSatisfactionResult | null = null;

  constructor(config: ICVSCoordinatorConfig, deps: CVSCoordinatorDeps) {
    this.buildId = config.buildId;
    this.appUrl = config.appUrl;
    this.designQualityThreshold = config.designQualityThreshold;
    this.journeyAgent = deps.journeyAgent;
    this.intentAgent = deps.intentAgent;
  }

  async runFullVerification(
    spec: ILivingSpecification,
    artifacts: IBuildArtifactsSummary,
    uxResult: IUXVerificationResult,
    designScore: IDesignQualityScore,
  ): Promise<ICVSResult> {
    // Extract user journeys from the spec for journey verification
    const journeys = extractJourneysFromSpec(spec);

    // Run Journey Verification and Intent Satisfaction in parallel —
    // they are independent assessments that both read from the spec
    // but don't depend on each other.
    const [journeyVerification, intentSatisfaction] = await Promise.all([
      this.journeyAgent.verify(uxResult, journeys, spec),
      this.intentAgent.verify(spec, artifacts),
    ]);

    // Store detailed results for retrieval
    this.journeyResult = journeyVerification;
    this.intentResult = intentSatisfaction;

    // Collect all unresolved critical/high issues
    const unresolvedHighIssues = collectUnresolvedHighIssues(uxResult);

    // Determine completeness per spec Section 10.1
    const complete = isComplete(
      intentSatisfaction,
      journeyVerification,
      designScore,
      this.designQualityThreshold,
      unresolvedHighIssues,
      artifacts,
    );

    return {
      buildId: this.buildId,
      explicitCoverage: intentSatisfaction.explicitCoverage,
      inferredCoverage: intentSatisfaction.inferredCoverage,
      intentScore: intentSatisfaction.intentScore,
      designQualityScore: designScore.overallScore,
      allJourneysVerified: journeyVerification.allJourneysVerified,
      unresolvedHighIssues,
      integrationPassing: artifacts.integrationPassing,
      complete,
    };
  }

  getJourneyVerificationResult(): IJourneyVerificationResult | null {
    return this.journeyResult;
  }

  getIntentSatisfactionResult(): IIntentSatisfactionResult | null {
    return this.intentResult;
  }
}

// ---------------------------------------------------------------------------
// Completeness determination — spec Section 10.1
// ---------------------------------------------------------------------------

/**
 * Determines whether the build is "done" per spec Section 10.1.
 *
 * A build is complete when ALL of:
 * - Every explicit feature is implemented and functional
 * - Every inferred need is implemented
 * - Every user journey has been tested and verified
 * - The intent verification agent confirms the build matches the prompt
 * - The design quality score meets the threshold
 * - All critical/high UX issues have been fixed
 * - The integration build passes
 */
function isComplete(
  intent: IIntentSatisfactionResult,
  journeys: IJourneyVerificationResult,
  designScore: IDesignQualityScore,
  designThreshold: number,
  unresolvedHighIssues: readonly IUXIssue[],
  artifacts: IBuildArtifactsSummary,
): boolean {
  // Every explicit feature implemented and functional
  if (intent.explicitCoverage < 100) return false;

  // Every inferred need implemented
  if (intent.inferredCoverage < 100) return false;

  // Every user journey tested and verified
  if (!journeys.allJourneysVerified) return false;

  // Intent verification agent confirms match
  if (!intent.overallSatisfied) return false;

  // Design quality meets threshold
  if (designScore.overallScore < designThreshold) return false;

  // All critical/high UX issues fixed
  if (unresolvedHighIssues.length > 0) return false;

  // Integration build passes
  if (!artifacts.integrationPassing) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Collect all unresolved critical/high issues from UX verification results.
 */
function collectUnresolvedHighIssues(
  uxResult: IUXVerificationResult,
): IUXIssue[] {
  const issues: IUXIssue[] = [];
  for (const jr of uxResult.journeyResults) {
    for (const issue of jr.issues) {
      if (
        !issue.resolved &&
        (issue.severity === "critical" || issue.severity === "high")
      ) {
        issues.push(issue);
      }
    }
  }
  return issues;
}

/**
 * Extract user journeys from the living specification's features.
 *
 * Creates synthetic IUserJourney objects from the spec's feature inventory.
 * In a full build, these would be extracted by the JourneyTestPlanner;
 * the CVS Coordinator creates lightweight representations for the
 * Journey Verification Agent to match against UX test results.
 */
function extractJourneysFromSpec(
  spec: ILivingSpecification,
): IUserJourney[] {
  return spec.features.map((feature, index) => ({
    id: `journey-${feature.id}`,
    name: `${feature.name} journey`,
    description: `User journey exercising: ${feature.description}`,
    steps: [
      {
        id: `step-${feature.id}-1`,
        order: 1,
        action: `Navigate to and use ${feature.name}`,
        expectedOutcome: feature.description,
      },
    ],
    requiredGoalIds: [],
    featureIds: [feature.id],
  }));
}
