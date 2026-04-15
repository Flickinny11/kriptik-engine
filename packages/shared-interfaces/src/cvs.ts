/**
 * Continuous Verification Stack (CVS) interfaces — Journey Verification,
 * Intent Satisfaction, and CVS Coordination.
 *
 * The CVS determines whether a build is "done" by orchestrating all
 * verification subsystems and producing a completeness assessment.
 *
 * Spec Section 10.1 — What "Done" Means
 * Spec Section 8.1 — UX Verification Teams (Navigator + Inspector)
 * Spec Section 8.3 — Verification Opportunities from Dependency Completion
 * Spec Section 2.2 — ICE Seven-Stage Pipeline (intent layers that CVS validates against)
 */

import type { ILivingSpecification } from "./ice.js";
import type { ICVSResult, IUXIssue } from "./verification.js";
import type {
  IJourneyTestResult,
  IUXVerificationResult,
  IUserJourney,
} from "./ux-verification.js";
import type { IDesignQualityScore } from "./enforcement.js";

// ---------------------------------------------------------------------------
// Journey Verification — validates all user journeys are functional
// ---------------------------------------------------------------------------

/**
 * Assessment of a single user journey's verification status.
 *
 * Combines the UX Verification Team's test result with the Journey
 * Verification Agent's higher-level assessment of whether the journey
 * meets the living specification's requirements.
 *
 * Spec Section 10.1 — "Every user journey identified in the living
 * specification has been tested by the UX Verification Team."
 */
export interface IJourneyAssessment {
  /** The journey that was assessed. */
  readonly journeyId: string;
  /** The journey name for human readability. */
  readonly journeyName: string;
  /** Whether this journey was tested by the UX Verification Team. */
  readonly tested: boolean;
  /** The UX Verification Team's test result (null if not yet tested). */
  readonly testResult: IJourneyTestResult | null;
  /** Whether the journey meets the specification's requirements. */
  readonly meetsSpecification: boolean;
  /** Agent's assessment explanation. */
  readonly assessment: string;
  /** Feature IDs this journey exercises. */
  readonly featureIds: readonly string[];
}

/**
 * IJourneyVerificationResult — complete journey verification assessment.
 *
 * The Journey Verification Agent produces this after analyzing all user
 * journeys from the living specification against the UX Verification
 * Team's test results.
 *
 * Spec Section 10.1 — "Every user journey identified in the living
 * specification has been tested by the UX Verification Team."
 */
export interface IJourneyVerificationResult {
  /** The build this verification belongs to. */
  readonly buildId: string;
  /** Individual journey assessments. */
  readonly journeyAssessments: readonly IJourneyAssessment[];
  /** Total number of journeys in the living specification. */
  readonly totalJourneys: number;
  /** Number of journeys that were tested. */
  readonly testedJourneys: number;
  /** Number of journeys that passed verification. */
  readonly passedJourneys: number;
  /** Whether ALL journeys were tested and passed. */
  readonly allJourneysVerified: boolean;
  /** Unresolved critical/high issues across all journeys. */
  readonly unresolvedHighIssues: readonly IUXIssue[];
  /** Agent's overall assessment narrative. */
  readonly overallAssessment: string;
  /** When this verification was completed. */
  readonly evaluatedAt: Date;
}

/**
 * IJourneyVerificationAgent — validates all user journeys are functional.
 *
 * Takes the UX Verification Team's journey test results and the living
 * specification, then verifies that every user journey from the spec
 * has been tested and meets requirements. This is a verification
 * ASSESSMENT agent — it reasons about test results, not executes tests.
 *
 * Spec Section 10.1 — the CVS includes journey verification as a
 * completeness criterion: "Every user journey identified in the living
 * specification has been tested by the UX Verification Team."
 */
export interface IJourneyVerificationAgent {
  /** The underlying agent session ID. */
  readonly agentId: string;
  /** The build this agent belongs to. */
  readonly buildId: string;

  /**
   * Verify all user journeys against UX Verification Team results.
   *
   * Analyzes whether every journey from the living specification was
   * tested, whether test results indicate the journeys are functional,
   * and whether unresolved issues affect completeness.
   *
   * @param uxResult - The UX Verification Team's comprehensive result
   * @param journeys - All user journeys extracted from the living specification
   * @param spec - The living specification for feature/intent context
   */
  verify(
    uxResult: IUXVerificationResult,
    journeys: readonly IUserJourney[],
    spec: ILivingSpecification,
  ): Promise<IJourneyVerificationResult>;
}

// ---------------------------------------------------------------------------
// Intent Satisfaction — validates build meets original user intent
// ---------------------------------------------------------------------------

/**
 * Assessment of a single feature's implementation status.
 *
 * The Intent Satisfaction Agent evaluates each feature from the living
 * specification to determine whether it was implemented and is functional.
 *
 * Spec Section 10.1 — "Every explicit feature the user requested is
 * implemented and functional" and "Every inferred need from ICE's
 * six methods is implemented."
 */
export interface IFeatureAssessment {
  /** The feature ID from the living specification. */
  readonly featureId: string;
  /** The feature name. */
  readonly featureName: string;
  /** Which intent layer this feature addresses. */
  readonly intentSource: "surface" | "deep" | "unstated";
  /** Whether the feature appears to be implemented. */
  readonly implemented: boolean;
  /** Whether the feature appears to be functional (not just stubbed). */
  readonly functional: boolean;
  /** Agent's assessment explanation. */
  readonly assessment: string;
  /** Confidence level 0-1. */
  readonly confidence: number;
}

/**
 * Assessment of whether a technical constraint from ICE Stage 3 is met.
 *
 * Spec Section 2.2, Stage 3 — Technical Surface Probing produces
 * constraint maps that the build must satisfy.
 */
export interface IConstraintAssessment {
  /** The service this constraint belongs to (e.g. "Stripe", "Pusher"). */
  readonly service: string;
  /** Description of the constraint being assessed. */
  readonly constraint: string;
  /** Whether the constraint appears to be satisfied. */
  readonly met: boolean;
  /** Agent's assessment explanation. */
  readonly assessment: string;
}

/**
 * Summary of build artifacts for intent verification.
 *
 * Provides the Intent Satisfaction Agent with information about what
 * was actually built, so it can compare against the living specification.
 */
export interface IBuildArtifactsSummary {
  /** The build this summary belongs to. */
  readonly buildId: string;
  /** All files created or modified during the build. */
  readonly files: readonly string[];
  /** Routes/pages implemented in the application. */
  readonly routes: readonly string[];
  /** External integrations configured (service names). */
  readonly integrations: readonly string[];
  /** Whether the integration build passes (types, lint, tests). */
  readonly integrationPassing: boolean;
  /** Number of tests passing. */
  readonly testsPassCount: number;
  /** Number of tests failing. */
  readonly testsFailCount: number;
}

/**
 * IIntentSatisfactionResult — complete intent satisfaction assessment.
 *
 * The Intent Satisfaction Agent produces this after analyzing the build
 * output against the living specification's intent layers, features,
 * constraint maps, and design brief.
 *
 * Spec Section 10.1 — "The intent verification agent confirms the built
 * app matches the original prompt (including unstated needs)."
 */
export interface IIntentSatisfactionResult {
  /** The build this result belongs to. */
  readonly buildId: string;
  /** Overall intent satisfaction score 0-100. */
  readonly intentScore: number;
  /** Percentage of explicit (surface) features implemented and functional. */
  readonly explicitCoverage: number;
  /** Percentage of inferred (deep + unstated) features implemented. */
  readonly inferredCoverage: number;
  /** Individual feature assessments. */
  readonly featureAssessments: readonly IFeatureAssessment[];
  /** Constraint satisfaction assessments. */
  readonly constraintAssessments: readonly IConstraintAssessment[];
  /** Whether the design brief's direction was honored. */
  readonly designBriefHonored: boolean;
  /** Agent's design brief assessment explanation. */
  readonly designBriefAssessment: string;
  /** Whether the build satisfies the original user intent overall. */
  readonly overallSatisfied: boolean;
  /** Agent's overall assessment narrative. */
  readonly overallAssessment: string;
  /** When this verification was completed. */
  readonly evaluatedAt: Date;
}

/**
 * IIntentSatisfactionAgent — validates build meets original user intent.
 *
 * Analyzes the living specification (original intent, features, constraints,
 * design brief) against the actual build output to verify that the built
 * application matches what the user asked for — including unstated needs
 * inferred by ICE's six methods.
 *
 * Spec Section 10.1 — "The intent verification agent confirms the built
 * app matches the original prompt (including unstated needs)."
 * Spec Section 2.1 — ICE captures surface, deep, and unstated intent.
 */
export interface IIntentSatisfactionAgent {
  /** The underlying agent session ID. */
  readonly agentId: string;
  /** The build this agent belongs to. */
  readonly buildId: string;

  /**
   * Verify that the build satisfies the original user intent.
   *
   * Evaluates every feature from the living specification (surface,
   * deep, unstated), checks constraint maps, and assesses whether
   * the design brief was honored.
   *
   * @param spec - The living specification with intent layers and features
   * @param artifacts - Summary of what was actually built
   */
  verify(
    spec: ILivingSpecification,
    artifacts: IBuildArtifactsSummary,
  ): Promise<IIntentSatisfactionResult>;
}

// ---------------------------------------------------------------------------
// CVS Coordinator — orchestrates the full Continuous Verification Stack
// ---------------------------------------------------------------------------

/**
 * Configuration for the CVS Coordinator.
 *
 * Spec Section 10.1 — the coordinator uses these settings to determine
 * the completeness threshold.
 */
export interface ICVSCoordinatorConfig {
  /** The build ID. */
  readonly buildId: string;
  /** The application URL for UX verification. */
  readonly appUrl: string;
  /** Design quality score threshold (0-100, default 70). */
  readonly designQualityThreshold: number;
}

/**
 * ICVSCoordinator — orchestrates the full Continuous Verification Stack.
 *
 * Coordinates all verification subsystems to produce the final completeness
 * assessment that determines whether a build is "done" per spec Section 10.1:
 *
 * 1. Anti-slop linting (merge gate Check 5, already enforced per-merge)
 * 2. UX Verification Teams (Navigator + Inspector journey testing)
 * 3. Journey Verification (all spec journeys tested and passing)
 * 4. Intent Satisfaction (build matches original prompt including unstated needs)
 * 5. Design Quality Scoring (meets user-adjustable threshold)
 * 6. Integration checks (types, lint, tests, security)
 *
 * Spec Section 10.1 — What "Done" Means.
 */
export interface ICVSCoordinator {
  /** The build this coordinator belongs to. */
  readonly buildId: string;

  /**
   * Run the full Continuous Verification Stack.
   *
   * Orchestrates Journey Verification and Intent Satisfaction agents,
   * combines their results with UX Verification Team output and design
   * quality scoring, and produces the final ICVSResult.
   *
   * @param spec - The living specification
   * @param artifacts - Summary of build artifacts
   * @param uxResult - UX Verification Team results (already executed)
   * @param designScore - Design quality score from enforcement stack
   */
  runFullVerification(
    spec: ILivingSpecification,
    artifacts: IBuildArtifactsSummary,
    uxResult: IUXVerificationResult,
    designScore: IDesignQualityScore,
  ): Promise<ICVSResult>;

  /**
   * Get the detailed journey verification result.
   * Available after runFullVerification completes.
   */
  getJourneyVerificationResult(): IJourneyVerificationResult | null;

  /**
   * Get the detailed intent satisfaction result.
   * Available after runFullVerification completes.
   */
  getIntentSatisfactionResult(): IIntentSatisfactionResult | null;
}
