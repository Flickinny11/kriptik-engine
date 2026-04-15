/**
 * UXVerificationTeam — coordinates Navigator + Inspector into a
 * verification workflow against user journeys.
 *
 * Implements the tandem protocol from spec Section 8.1:
 *   1. Inspector starts monitoring
 *   2. Navigator executes a step (navigates, interacts, observes)
 *   3. Inspector reports what the logs showed for that step
 *   4. Combined step result is produced
 *   5. Repeat for all steps
 *   6. Aggregate into severity-classified UX report
 *
 * Implements the document-first-then-triage strategy from spec Section 8.2:
 *   Documents EVERYTHING before fixing. Multiple symptoms may trace to
 *   one root cause — documenting all first reveals the root cause.
 *
 * Spec Section 8.1 — UX Verification Teams.
 * Spec Section 8.2 — Document-First-Then-Triage Strategy.
 * Spec Section 7.3 Layer 6 — UX Verification (scored assessment).
 * Spec Section 12.4, Phase C Step 12 — UX Verification Teams.
 */

import { randomUUID } from "node:crypto";
import type {
  INavigatorAgent,
  IInspectorAgent,
  IUXVerificationTeam,
  IJourneyTestPlan,
  IJourneyTestResult,
  IJourneyStepResult,
  IUXVerificationResult,
  IUserJourney,
  IUXReport,
  IUXIssue,
  UXIssueSeverity,
} from "@kriptik/shared-interfaces";

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * UXVerificationTeam implementation.
 *
 * Runs the tandem protocol: for each journey step, the Inspector monitors
 * while the Navigator acts, then both observations are combined into a
 * step result. After all steps, issues are severity-classified and
 * aggregated into a UX report.
 */
export class UXVerificationTeam implements IUXVerificationTeam {
  readonly navigator: INavigatorAgent;
  readonly inspector: IInspectorAgent;
  readonly buildId: string;

  constructor(
    navigator: INavigatorAgent,
    inspector: IInspectorAgent,
    buildId: string,
  ) {
    this.navigator = navigator;
    this.inspector = inspector;
    this.buildId = buildId;
  }

  /**
   * Execute a full journey test plan.
   *
   * Runs all journeys sequentially (each journey is an independent flow
   * through the app), collects combined observations from both agents,
   * and produces a UX verification result.
   *
   * Spec Section 8.2 — documents everything before fixing anything.
   */
  async executeTestPlan(
    plan: IJourneyTestPlan,
    appUrl: string,
  ): Promise<IUXVerificationResult> {
    const startTime = Date.now();
    const journeyResults: IJourneyTestResult[] = [];

    for (const journey of plan.journeys) {
      const result = await this.executeJourney(
        journey,
        appUrl,
        plan.verificationType,
      );
      journeyResults.push(result);
    }

    const allIssues = journeyResults.flatMap((r) => r.issues);
    const report = this.buildReport(plan, allIssues);
    const passed = !allIssues.some(
      (issue) =>
        !issue.resolved &&
        (issue.severity === "critical" || issue.severity === "high"),
    );

    return {
      planId: plan.id,
      buildId: this.buildId,
      verificationType: plan.verificationType,
      journeyResults,
      report,
      passed,
      executedAt: new Date(),
      totalDurationMs: Date.now() - startTime,
    };
  }

  /**
   * Execute a single journey test via the tandem protocol.
   *
   * For each step in the journey:
   *   1. Inspector starts monitoring (once, at journey start)
   *   2. Navigator executes the step
   *   3. Inspector reports diagnostics for that step
   *   4. Combined step result is produced
   *
   * After all steps, Inspector stops monitoring and produces its final
   * report. Issues are classified by severity per spec Section 8.2.
   */
  async executeJourney(
    journey: IUserJourney,
    appUrl: string,
    verificationType: "mid-build" | "comprehensive",
  ): Promise<IJourneyTestResult> {
    const startTime = Date.now();
    const stepResults: IJourneyStepResult[] = [];
    const issues: IUXIssue[] = [];

    // Inspector begins monitoring before Navigator starts
    await this.inspector.startMonitoring(journey.id);

    // Execute each step via the tandem protocol
    for (const step of journey.steps) {
      const navResult = await this.navigator.executeStep(step, appUrl);
      const inspDiag = await this.inspector.getDiagnosticForStep(step.id);

      const stepResult: IJourneyStepResult = {
        stepId: step.id,
        passed: navResult.passed && inspDiag.issues.length === 0,
        navigatorObservation: navResult.observation,
        inspectorDiagnostic: inspDiag.issues.length > 0
          ? inspDiag.issues.join("; ")
          : "No runtime issues detected",
        screenshotRef: navResult.screenshotRef,
        consoleLogs: inspDiag.consoleLogs,
        networkRequests: inspDiag.networkRequests,
        durationMs: 0, // Measured at the session level, not here
      };

      stepResults.push(stepResult);

      // Classify visual issues from Navigator
      for (const visualIssue of navResult.visualIssues) {
        issues.push(
          classifyIssue(
            journey.name,
            navResult.observation,
            visualIssue,
            "navigator",
          ),
        );
      }

      // Classify runtime issues from Inspector
      for (const runtimeIssue of inspDiag.issues) {
        issues.push(
          classifyIssue(
            journey.name,
            runtimeIssue,
            inspDiag.consoleLogs.map((l) => l.message).join("; "),
            "inspector",
          ),
        );
      }
    }

    // Inspector produces final report
    const inspectorReport = await this.inspector.stopMonitoring();

    // Add journey-level issues from the Inspector's final report
    for (const error of inspectorReport.consoleErrors) {
      if (!issues.some((i) => i.inspectorDiagnostic.includes(error.message))) {
        issues.push(
          classifyIssue(
            journey.name,
            `Console error: ${error.message}`,
            error.message,
            "inspector",
          ),
        );
      }
    }

    for (const req of inspectorReport.failedRequests) {
      if (!issues.some((i) => i.inspectorDiagnostic.includes(req.url))) {
        issues.push(
          classifyIssue(
            journey.name,
            `Failed request: ${req.method} ${req.url}`,
            req.errorMessage || `Status ${req.statusCode}`,
            "inspector",
          ),
        );
      }
    }

    for (const rejection of inspectorReport.unhandledRejections) {
      issues.push(
        classifyIssue(
          journey.name,
          `Unhandled promise rejection: ${rejection}`,
          rejection,
          "inspector",
        ),
      );
    }

    const passed = !issues.some(
      (issue) =>
        !issue.resolved &&
        (issue.severity === "critical" || issue.severity === "high"),
    );

    return {
      id: randomUUID(),
      planId: "",
      journeyId: journey.id,
      buildId: this.buildId,
      stepResults,
      issues,
      passed,
      executedAt: new Date(),
      durationMs: Date.now() - startTime,
    };
  }

  // -------------------------------------------------------------------------
  // Report building
  // -------------------------------------------------------------------------

  /**
   * Build an IUXReport from aggregated issues across all journeys.
   *
   * The IUXReport interface is the existing contract from shared-interfaces
   * verification.ts — we produce a report compatible with that interface.
   */
  private buildReport(
    plan: IJourneyTestPlan,
    allIssues: readonly IUXIssue[],
  ): IUXReport {
    const passed = !allIssues.some(
      (issue) =>
        !issue.resolved &&
        (issue.severity === "critical" || issue.severity === "high"),
    );

    return {
      id: randomUUID(),
      buildId: this.buildId,
      journey: plan.journeys.map((j) => j.name).join(", "),
      issues: allIssues,
      verificationType: plan.verificationType,
      passed,
      evaluatedAt: new Date(),
    };
  }
}

// ---------------------------------------------------------------------------
// Issue classification — spec Section 8.2 triage priority
// ---------------------------------------------------------------------------

/**
 * Classify a UX issue by severity based on its characteristics.
 *
 * Spec Section 8.2 — Triage priority:
 *   Critical — blocks further testing (e.g., page won't load, crash)
 *   High — core feature broken
 *   Medium — UX degraded but functional
 *   Low — polish items
 */
function classifyIssue(
  journeyName: string,
  navigatorObservation: string,
  inspectorDiagnostic: string,
  source: "navigator" | "inspector",
): IUXIssue {
  const combined = `${navigatorObservation} ${inspectorDiagnostic}`.toLowerCase();
  let severity: UXIssueSeverity;

  if (
    combined.includes("crash") ||
    combined.includes("white screen") ||
    combined.includes("blank page") ||
    combined.includes("won't load") ||
    combined.includes("fatal") ||
    combined.includes("uncaught")
  ) {
    severity = "critical";
  } else if (
    combined.includes("broken") ||
    combined.includes("failed") ||
    combined.includes("error") ||
    combined.includes("missing") ||
    combined.includes("not found") ||
    combined.includes("cors")
  ) {
    severity = "high";
  } else if (
    combined.includes("slow") ||
    combined.includes("flash") ||
    combined.includes("flicker") ||
    combined.includes("layout shift") ||
    combined.includes("deprecat") ||
    combined.includes("warning")
  ) {
    severity = "medium";
  } else {
    severity = "low";
  }

  return {
    id: randomUUID(),
    severity,
    navigatorObservation: source === "navigator" ? navigatorObservation : "",
    inspectorDiagnostic: source === "inspector" ? inspectorDiagnostic : "",
    journey: journeyName,
    resolved: false,
  };
}
