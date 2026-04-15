/**
 * UX Verification Team interfaces — Navigator + Inspector tandem agents
 * that test the application as a human would, catching issues that
 * functional testing and static analysis miss.
 *
 * Spec Section 8.1 — UX Verification Teams (Navigator + Inspector)
 * Spec Section 7.3 Layer 6 — UX Verification (scored assessment)
 * Spec Section 8.2 — Document-First-Then-Triage Strategy
 * Spec Section 8.3 — Verification Opportunities from Dependency Completion
 */

import type { ILivingSpecification } from "./ice.js";
import type { IUXIssue, IUXReport } from "./verification.js";

// ---------------------------------------------------------------------------
// User journeys — extracted from the living specification
// ---------------------------------------------------------------------------

/**
 * A user journey extracted from the living specification.
 *
 * Represents a complete flow a human user would take through the app.
 * Journeys become testable when their required goals are all merged.
 *
 * Spec Section 8.3 — verification opportunities from dependency completion.
 */
export interface IUserJourney {
  /** Unique journey identifier. */
  readonly id: string;
  /** Human-readable journey name (e.g. "Sign up and create first project"). */
  readonly name: string;
  /** Description of what this journey tests. */
  readonly description: string;
  /** Ordered interaction steps the user takes. */
  readonly steps: readonly IJourneyStep[];
  /** Goal IDs whose completion enables this journey to be tested. */
  readonly requiredGoalIds: readonly string[];
  /** Feature spec IDs this journey exercises. */
  readonly featureIds: readonly string[];
}

/**
 * A single step within a user journey.
 *
 * Describes one interaction the Navigator will perform and what both
 * Navigator and Inspector should observe.
 */
export interface IJourneyStep {
  /** Unique step identifier. */
  readonly id: string;
  /** Execution order within the journey (1-indexed). */
  readonly order: number;
  /** What the user does (e.g. "click the Sign Up button"). */
  readonly action: string;
  /** What should happen (e.g. "registration form appears with email field focused"). */
  readonly expectedOutcome: string;
  /** URL path if this step involves navigation. */
  readonly route?: string;
}

// ---------------------------------------------------------------------------
// Journey test planning
// ---------------------------------------------------------------------------

/**
 * IJourneyTestPlan — test plan generated from living specification user journeys.
 *
 * Created either mid-build (when dependency completion clusters enable testable
 * journeys) or at end-of-build (comprehensive verification of all journeys).
 *
 * Spec Section 8.3 — "When a cluster of completed goals enables a testable
 * user journey, deploy a UX team to test that journey."
 */
export interface IJourneyTestPlan {
  /** Unique plan identifier. */
  readonly id: string;
  /** The build this plan belongs to. */
  readonly buildId: string;
  /** The user journeys to verify in this plan. */
  readonly journeys: readonly IUserJourney[];
  /** Whether this is a mid-build opportunity or comprehensive end-of-build. */
  readonly verificationType: "mid-build" | "comprehensive";
  /** Goal IDs whose completion triggered this test plan (mid-build only). */
  readonly triggeringGoalIds: readonly string[];
  /** When this plan was generated. */
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Journey test results
// ---------------------------------------------------------------------------

/**
 * IJourneyTestResult — result of executing a single journey test.
 *
 * Combines Navigator visual observations with Inspector runtime diagnostics
 * for each step, producing severity-classified issues.
 *
 * Spec Section 8.1 — Tandem Protocol: Navigator reports what it sees,
 * Inspector reports what the logs show.
 */
export interface IJourneyTestResult {
  /** Unique result identifier. */
  readonly id: string;
  /** The plan this result belongs to. */
  readonly planId: string;
  /** The journey that was tested. */
  readonly journeyId: string;
  /** The build this result belongs to. */
  readonly buildId: string;
  /** Step-by-step results from Navigator + Inspector tandem. */
  readonly stepResults: readonly IJourneyStepResult[];
  /** Issues found during this journey test. */
  readonly issues: readonly IUXIssue[];
  /** Overall pass/fail — fails if any unresolved critical or high issues. */
  readonly passed: boolean;
  /** When this test was executed. */
  readonly executedAt: Date;
  /** Total duration in milliseconds. */
  readonly durationMs: number;
}

/**
 * Result of a single journey step — combined Navigator + Inspector output.
 *
 * Spec Section 8.1 — The Tandem Protocol.
 */
export interface IJourneyStepResult {
  /** The step this result corresponds to. */
  readonly stepId: string;
  /** Whether the step completed as expected. */
  readonly passed: boolean;
  /** Navigator's visual observation of what happened on screen. */
  readonly navigatorObservation: string;
  /** Inspector's runtime diagnostic of what happened in logs/network. */
  readonly inspectorDiagnostic: string;
  /** Reference to screenshot taken at this step (path or base64 key). */
  readonly screenshotRef?: string;
  /** Console log entries captured during this step. */
  readonly consoleLogs: readonly IConsoleLogEntry[];
  /** Network requests made during this step. */
  readonly networkRequests: readonly INetworkRequestLog[];
  /** Duration of this step in milliseconds. */
  readonly durationMs: number;
}

// ---------------------------------------------------------------------------
// Runtime inspection types — used by the Inspector agent
// ---------------------------------------------------------------------------

/** A console log entry captured by the Inspector. */
export interface IConsoleLogEntry {
  /** Log level. */
  readonly level: "log" | "warn" | "error" | "info";
  /** Log message text. */
  readonly message: string;
  /** When this log entry was captured. */
  readonly timestamp: Date;
  /** Source file and line number if available. */
  readonly source?: string;
}

/** A network request logged during verification. */
export interface INetworkRequestLog {
  /** Request URL. */
  readonly url: string;
  /** HTTP method. */
  readonly method: string;
  /** Response status code. */
  readonly statusCode: number;
  /** Request-response duration in milliseconds. */
  readonly durationMs: number;
  /** Whether the request failed (network error, timeout, non-2xx). */
  readonly failed: boolean;
  /** Error message if the request failed. */
  readonly errorMessage?: string;
}

/** Performance snapshot captured during a journey step. */
export interface IPerformanceSnapshot {
  /** Heap memory usage in megabytes. */
  readonly memoryUsageMB: number;
  /** Total DOM node count. */
  readonly domNodeCount: number;
  /** Cumulative layout shift score. */
  readonly layoutShifts: number;
  /** Number of long tasks (> 50ms). */
  readonly longTasks: number;
}

// ---------------------------------------------------------------------------
// Navigator agent
// ---------------------------------------------------------------------------

/**
 * Navigator's result from executing a single journey step.
 * Contains the visual observation and any issues detected.
 */
export interface INavigatorStepResult {
  /** The step this result corresponds to. */
  readonly stepId: string;
  /** What the Navigator saw on screen after performing the action. */
  readonly observation: string;
  /** Reference to screenshot taken after the action. */
  readonly screenshotRef?: string;
  /** Whether the expected outcome was observed. */
  readonly passed: boolean;
  /** Visual quality issues observed (e.g. "flash of unstyled content"). */
  readonly visualIssues: readonly string[];
}

/**
 * Visual quality assessment dimensions.
 *
 * Spec Section 8.1 — the Navigator tests beyond functional correctness:
 * responsiveness, loading states, error states, visual polish, flow
 * coherence, content quality, and mobile responsiveness.
 */
export interface IVisualQualityAssessment {
  /** The route that was assessed. */
  readonly route: string;
  /** Immediate UI feedback on interaction. */
  readonly responsiveness: IQualityDimension;
  /** Appropriate loading indicators that communicate what's happening. */
  readonly loadingStates: IQualityDimension;
  /** Helpful vs cryptic error messages, recovery possible? */
  readonly errorStates: IQualityDimension;
  /** Flash of unstyled content? Smooth transitions? Consistent spacing? */
  readonly visualPolish: IQualityDimension;
  /** Logical navigation? Dead ends? */
  readonly flowCoherence: IQualityDimension;
  /** Placeholder text still present? Content makes sense? */
  readonly contentQuality: IQualityDimension;
  /** Layout adapts to mobile viewports? */
  readonly mobileResponsiveness: IQualityDimension;
  /** Aggregate score 0-10 across all dimensions. */
  readonly overallScore: number;
}

/** Score for a single quality dimension. */
export interface IQualityDimension {
  /** Dimension name. */
  readonly name: string;
  /** Score 0-10. */
  readonly score: number;
  /** What was observed for this dimension. */
  readonly observations: readonly string[];
  /** Issues found in this dimension. */
  readonly issues: readonly string[];
}

/**
 * INavigatorAgent — browser-based visual verification agent.
 *
 * A vision-capable Opus 4.6 agent using computer-use capabilities that
 * uses the app as a human would. Takes screenshots at every interaction
 * point and assesses visual quality beyond functional correctness.
 *
 * Spec Section 8.1 — "A vision-capable Opus 4.6 agent using the
 * Anthropic API's computer use capabilities."
 * Spec Section 1.4 — vision for UX verification (Navigator agent).
 */
export interface INavigatorAgent {
  /** The underlying agent session ID. */
  readonly agentId: string;
  /** The build this Navigator belongs to. */
  readonly buildId: string;

  /**
   * Execute a journey step by navigating, interacting, and observing.
   * Returns the Navigator's visual observation and screenshot.
   */
  executeStep(
    step: IJourneyStep,
    appUrl: string,
  ): Promise<INavigatorStepResult>;

  /**
   * Verify visual quality aspects beyond functional correctness.
   * Assesses seven dimensions per spec Section 8.1.
   */
  assessVisualQuality(
    route: string,
    appUrl: string,
  ): Promise<IVisualQualityAssessment>;
}

// ---------------------------------------------------------------------------
// Inspector agent
// ---------------------------------------------------------------------------

/**
 * Inspector's diagnostic report for a single journey step.
 * Contains console logs, network requests, and performance metrics
 * captured while the Navigator interacted.
 */
export interface IInspectorDiagnostic {
  /** The step this diagnostic covers. */
  readonly stepId: string;
  /** Console log entries captured during this step. */
  readonly consoleLogs: readonly IConsoleLogEntry[];
  /** Network requests made during this step. */
  readonly networkRequests: readonly INetworkRequestLog[];
  /** Performance snapshot at this step. */
  readonly performanceMetrics: IPerformanceSnapshot;
  /** Issues detected from runtime analysis. */
  readonly issues: readonly string[];
}

/**
 * Inspector's final report for a fully monitored journey.
 *
 * Spec Section 8.1 — the Inspector catches: silent console errors,
 * deprecation warnings, failed network requests, performance issues,
 * unhandled promise rejections, missing environment variables.
 */
export interface IInspectorReport {
  /** The journey this report covers. */
  readonly journeyId: string;
  /** All console errors and warnings. */
  readonly consoleErrors: readonly IConsoleLogEntry[];
  /** Failed network requests (CORS, auth failures, timeouts). */
  readonly failedRequests: readonly INetworkRequestLog[];
  /** Deprecation warnings detected. */
  readonly deprecationWarnings: readonly string[];
  /** Unhandled promise rejections. */
  readonly unhandledRejections: readonly string[];
  /** Aggregate performance summary. */
  readonly performanceSummary: IPerformanceSnapshot;
}

/**
 * IInspectorAgent — runtime inspection agent.
 *
 * Reads runtime logs, console output, network requests, and performance
 * metrics while the Navigator interacts with the application.
 *
 * Spec Section 8.1 — "Reads runtime logs, console output, network
 * requests, and performance metrics while the Navigator interacts."
 */
export interface IInspectorAgent {
  /** The underlying agent session ID. */
  readonly agentId: string;
  /** The build this Inspector belongs to. */
  readonly buildId: string;

  /**
   * Start monitoring runtime output for a journey.
   * Must be called before Navigator begins interacting.
   */
  startMonitoring(journeyId: string): Promise<void>;

  /**
   * Get the diagnostic report for a specific step.
   * Called after Navigator completes each step.
   */
  getDiagnosticForStep(stepId: string): Promise<IInspectorDiagnostic>;

  /**
   * Stop monitoring and produce final runtime report.
   */
  stopMonitoring(): Promise<IInspectorReport>;
}

// ---------------------------------------------------------------------------
// UX Verification Team — Navigator + Inspector coordinated
// ---------------------------------------------------------------------------

/**
 * Complete result of a UX verification run across all journeys in a plan.
 */
export interface IUXVerificationResult {
  /** The plan that was executed. */
  readonly planId: string;
  /** The build this result belongs to. */
  readonly buildId: string;
  /** Whether this was mid-build or comprehensive. */
  readonly verificationType: "mid-build" | "comprehensive";
  /** Individual journey test results. */
  readonly journeyResults: readonly IJourneyTestResult[];
  /** Aggregated UX report (compatible with existing IUXReport interface). */
  readonly report: IUXReport;
  /** Whether all critical/high issues are resolved. */
  readonly passed: boolean;
  /** When this verification was executed. */
  readonly executedAt: Date;
  /** Total duration in milliseconds. */
  readonly totalDurationMs: number;
}

/**
 * IUXVerificationTeam — coordinates Navigator + Inspector into a
 * verification workflow against user journeys.
 *
 * Implements the tandem protocol: for each step, the Inspector starts
 * monitoring, then the Navigator acts, then the Inspector reports what
 * the logs showed. Together they produce a combined UX assessment with
 * severity-classified issues.
 *
 * Spec Section 8.1 — two-agent pairs that test the app as a human would.
 * Spec Section 8.2 — documents everything before fixing anything.
 */
export interface IUXVerificationTeam {
  /** The Navigator agent in this team. */
  readonly navigator: INavigatorAgent;
  /** The Inspector agent in this team. */
  readonly inspector: IInspectorAgent;
  /** The build this team is verifying. */
  readonly buildId: string;

  /**
   * Execute a full journey test plan.
   * Runs all journeys via the tandem protocol, collects observations from
   * both agents, and produces a combined UX verification result.
   *
   * Spec Section 8.2 — documents everything before fixing anything.
   */
  executeTestPlan(
    plan: IJourneyTestPlan,
    appUrl: string,
  ): Promise<IUXVerificationResult>;

  /**
   * Execute a single journey test via the tandem protocol.
   */
  executeJourney(
    journey: IUserJourney,
    appUrl: string,
    verificationType: "mid-build" | "comprehensive",
  ): Promise<IJourneyTestResult>;
}

// ---------------------------------------------------------------------------
// Journey test planner
// ---------------------------------------------------------------------------

/**
 * IJourneyTestPlanner — generates test plans from the living specification.
 *
 * Extracts user journeys from the spec's features and determines when
 * journeys become testable based on goal completion clusters.
 *
 * Spec Section 8.3 — verification opportunities from dependency completion.
 */
export interface IJourneyTestPlanner {
  /**
   * Extract user journeys from the living specification's features.
   * Maps features to end-to-end user flows with ordered steps.
   */
  extractJourneys(
    spec: ILivingSpecification,
  ): Promise<readonly IUserJourney[]>;

  /**
   * Given a set of newly completed goal IDs, determine which user journeys
   * are now testable. Returns a test plan if any journeys are ready.
   *
   * Returns null if no new journeys became testable.
   *
   * Spec Section 8.3 — "When a cluster of completed goals enables a
   * testable user journey, deploy a UX team."
   */
  planFromCompletedGoals(
    completedGoalIds: readonly string[],
    allJourneys: readonly IUserJourney[],
    previouslyTestedJourneyIds: readonly string[],
    buildId: string,
  ): IJourneyTestPlan | null;

  /**
   * Generate a comprehensive test plan covering all journeys.
   * Used at end-of-build for full verification.
   */
  planComprehensive(
    allJourneys: readonly IUserJourney[],
    buildId: string,
  ): IJourneyTestPlan;
}
