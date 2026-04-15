/**
 * InspectorAgent — runtime inspection agent.
 *
 * Reads runtime logs, console output, network requests, and performance
 * metrics while the Navigator interacts with the application. Wraps an
 * ILiveAgentSession (inspector role) with RUNTIME_INSPECTION_TOOLS
 * (get_console_logs, get_network_requests).
 *
 * The Inspector operates in tandem with the Navigator: it starts monitoring
 * before the Navigator acts, then reports what the logs showed after each step.
 *
 * Spec Section 8.1 — Inspector Agent.
 * Spec Section 7.3 Layer 6 — UX Verification.
 * Spec Section 12.4, Phase C Step 12 — UX Verification Teams.
 */

import type {
  ILiveAgentSession,
  IInspectorAgent,
  IInspectorDiagnostic,
  IInspectorReport,
  IConsoleLogEntry,
  INetworkRequestLog,
  IPerformanceSnapshot,
} from "@kriptik/shared-interfaces";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface InspectorAgentConfig {
  /** The live agent session (inspector role). */
  readonly session: ILiveAgentSession;
  /** The build this Inspector belongs to. */
  readonly buildId: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * InspectorAgent implementation.
 *
 * Sends structured prompts to the underlying agent session, which is an
 * Opus 4.6 API conversation with RUNTIME_INSPECTION_TOOLS. The agent
 * uses get_console_logs and get_network_requests to monitor runtime
 * behavior and reports structured diagnostics.
 *
 * Spec Section 8.1 — "Reads runtime logs, console output, network
 * requests, and performance metrics while the Navigator interacts."
 */
export class InspectorAgent implements IInspectorAgent {
  readonly agentId: string;
  readonly buildId: string;
  private readonly session: ILiveAgentSession;
  private currentJourneyId: string | null = null;

  /** Accumulated logs per step during monitoring. */
  private stepDiagnostics: Map<string, IInspectorDiagnostic> = new Map();

  /** All console errors collected during the journey. */
  private allConsoleErrors: IConsoleLogEntry[] = [];
  /** All failed requests collected during the journey. */
  private allFailedRequests: INetworkRequestLog[] = [];
  /** Deprecation warnings found. */
  private deprecationWarnings: string[] = [];
  /** Unhandled rejections found. */
  private unhandledRejections: string[] = [];

  constructor(config: InspectorAgentConfig) {
    this.agentId = config.session.session.id;
    this.buildId = config.buildId;
    this.session = config.session;
  }

  /**
   * Start monitoring runtime output for a journey.
   *
   * Initializes the Inspector's monitoring session by directing the agent
   * to begin capturing console output and network requests.
   */
  async startMonitoring(journeyId: string): Promise<void> {
    this.currentJourneyId = journeyId;
    this.stepDiagnostics = new Map();
    this.allConsoleErrors = [];
    this.allFailedRequests = [];
    this.deprecationWarnings = [];
    this.unhandledRejections = [];

    const prompt = [
      `Begin monitoring runtime output for journey: ${journeyId}`,
      ``,
      `You will be asked to report diagnostics after each journey step.`,
      `For each step, use your tools to:`,
      `1. Get console logs (errors, warnings, and info)`,
      `2. Get network requests (look for failures, slow responses)`,
      ``,
      `Watch for these specific issues:`,
      `- Silent console errors`,
      `- Deprecation warnings`,
      `- Failed network requests (CORS, auth failures, timeouts)`,
      `- Performance issues (slow API responses, excessive re-renders)`,
      `- Unhandled promise rejections`,
      `- Missing environment variables`,
      ``,
      `Acknowledge that monitoring has started.`,
    ].join("\n");

    await this.session.send(prompt);
  }

  /**
   * Get the diagnostic report for a specific step.
   *
   * Called after the Navigator completes each step. Directs the Inspector
   * to capture current console and network state, then parses the response
   * into structured diagnostics.
   */
  async getDiagnosticForStep(stepId: string): Promise<IInspectorDiagnostic> {
    const prompt = [
      `Report diagnostics for step: ${stepId}`,
      ``,
      `Use get_console_logs to capture all console output since the last step.`,
      `Use get_network_requests to capture all network activity since the last step.`,
      ``,
      `Format your response as:`,
      `CONSOLE_ERRORS: [count of errors found]`,
      `CONSOLE_WARNINGS: [count of warnings found]`,
      `CONSOLE_ENTRIES: [summary of notable log entries]`,
      `NETWORK_FAILURES: [count of failed requests]`,
      `NETWORK_SUMMARY: [summary of network activity]`,
      `DEPRECATIONS: [any deprecation warnings, or "none"]`,
      `REJECTIONS: [any unhandled promise rejections, or "none"]`,
      `PERFORMANCE: [memory MB, DOM nodes, layout shifts, long tasks]`,
      `ISSUES: [comma-separated list of issues found, or "none"]`,
    ].join("\n");

    const response = await this.session.send(prompt);
    const diagnostic = this.parseDiagnosticResponse(stepId, response.textContent);

    this.stepDiagnostics.set(stepId, diagnostic);
    this.accumulateFindings(diagnostic);

    return diagnostic;
  }

  /**
   * Stop monitoring and produce final runtime report.
   *
   * Aggregates all findings from the journey into a single report.
   */
  async stopMonitoring(): Promise<IInspectorReport> {
    const journeyId = this.currentJourneyId || "unknown";

    const prompt = [
      `Monitoring complete for journey: ${journeyId}`,
      ``,
      `Provide a final summary of all runtime issues observed across all steps.`,
      `Include total counts of errors, failed requests, and performance concerns.`,
    ].join("\n");

    await this.session.send(prompt);

    const allDiagnostics = [...this.stepDiagnostics.values()];
    const performanceSummary = this.aggregatePerformance(allDiagnostics);

    this.currentJourneyId = null;

    return {
      journeyId,
      consoleErrors: [...this.allConsoleErrors],
      failedRequests: [...this.allFailedRequests],
      deprecationWarnings: [...this.deprecationWarnings],
      unhandledRejections: [...this.unhandledRejections],
      performanceSummary,
    };
  }

  // -------------------------------------------------------------------------
  // Response parsing
  // -------------------------------------------------------------------------

  /**
   * Parse the agent's diagnostic response into structured format.
   */
  private parseDiagnosticResponse(
    stepId: string,
    text: string,
  ): IInspectorDiagnostic {
    const consoleLogs = this.parseConsoleLogs(text);
    const networkRequests = this.parseNetworkRequests(text);
    const performanceMetrics = this.parsePerformanceMetrics(text);
    const issues = this.parseIssues(text);

    return {
      stepId,
      consoleLogs,
      networkRequests,
      performanceMetrics,
      issues,
    };
  }

  /**
   * Parse console log entries from the response text.
   */
  private parseConsoleLogs(text: string): IConsoleLogEntry[] {
    const logs: IConsoleLogEntry[] = [];
    const entriesStr = extractField(text, "CONSOLE_ENTRIES");
    if (!entriesStr || entriesStr.toLowerCase() === "none") return logs;

    const errorCount = parseInt(extractField(text, "CONSOLE_ERRORS") || "0", 10);
    const warningCount = parseInt(extractField(text, "CONSOLE_WARNINGS") || "0", 10);

    if (errorCount > 0) {
      logs.push({
        level: "error",
        message: `${errorCount} console error(s) detected. ${entriesStr}`,
        timestamp: new Date(),
      });
    }
    if (warningCount > 0) {
      logs.push({
        level: "warn",
        message: `${warningCount} console warning(s) detected.`,
        timestamp: new Date(),
      });
    }

    return logs;
  }

  /**
   * Parse network request summary from the response text.
   */
  private parseNetworkRequests(text: string): INetworkRequestLog[] {
    const requests: INetworkRequestLog[] = [];
    const failureCount = parseInt(
      extractField(text, "NETWORK_FAILURES") || "0",
      10,
    );
    const summary = extractField(text, "NETWORK_SUMMARY");

    if (failureCount > 0 && summary) {
      requests.push({
        url: "aggregated",
        method: "MIXED",
        statusCode: 0,
        durationMs: 0,
        failed: true,
        errorMessage: `${failureCount} failed request(s). ${summary}`,
      });
    }

    return requests;
  }

  /**
   * Parse performance metrics from the response text.
   */
  private parsePerformanceMetrics(text: string): IPerformanceSnapshot {
    const perfStr = extractField(text, "PERFORMANCE") || "";
    const numbers = perfStr.match(/[\d.]+/g) || [];

    return {
      memoryUsageMB: parseFloat(numbers[0] || "0"),
      domNodeCount: parseInt(numbers[1] || "0", 10),
      layoutShifts: parseFloat(numbers[2] || "0"),
      longTasks: parseInt(numbers[3] || "0", 10),
    };
  }

  /**
   * Parse issues from the response text.
   */
  private parseIssues(text: string): string[] {
    const issuesStr = extractField(text, "ISSUES");
    if (!issuesStr || issuesStr.toLowerCase() === "none") return [];
    return issuesStr
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // -------------------------------------------------------------------------
  // Accumulation
  // -------------------------------------------------------------------------

  /**
   * Accumulate findings from a step diagnostic into journey-level collections.
   */
  private accumulateFindings(diagnostic: IInspectorDiagnostic): void {
    for (const log of diagnostic.consoleLogs) {
      if (log.level === "error") {
        this.allConsoleErrors.push(log);
      }
    }

    for (const req of diagnostic.networkRequests) {
      if (req.failed) {
        this.allFailedRequests.push(req);
      }
    }

    const deprecationStr = extractField(
      diagnostic.issues.join(", "),
      "deprecat",
    );
    if (deprecationStr) {
      this.deprecationWarnings.push(deprecationStr);
    }

    for (const issue of diagnostic.issues) {
      if (issue.toLowerCase().includes("deprecat")) {
        this.deprecationWarnings.push(issue);
      }
      if (
        issue.toLowerCase().includes("unhandled") &&
        issue.toLowerCase().includes("reject")
      ) {
        this.unhandledRejections.push(issue);
      }
    }
  }

  /**
   * Aggregate performance snapshots across all steps.
   * Takes the maximum values as the summary.
   */
  private aggregatePerformance(
    diagnostics: IInspectorDiagnostic[],
  ): IPerformanceSnapshot {
    if (diagnostics.length === 0) {
      return { memoryUsageMB: 0, domNodeCount: 0, layoutShifts: 0, longTasks: 0 };
    }

    return {
      memoryUsageMB: Math.max(...diagnostics.map((d) => d.performanceMetrics.memoryUsageMB)),
      domNodeCount: Math.max(...diagnostics.map((d) => d.performanceMetrics.domNodeCount)),
      layoutShifts: diagnostics.reduce((sum, d) => sum + d.performanceMetrics.layoutShifts, 0),
      longTasks: diagnostics.reduce((sum, d) => sum + d.performanceMetrics.longTasks, 0),
    };
  }
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

function extractField(text: string, fieldName: string): string | null {
  const regex = new RegExp(`${fieldName}:\\s*(.+?)(?:\\n|$)`, "i");
  const match = regex.exec(text);
  return match ? match[1]!.trim() : null;
}
