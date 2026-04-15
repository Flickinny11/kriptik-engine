/**
 * Verification and merge gate interfaces — the five-check merge gate and
 * the six-layer verification pyramid that ensure production-grade quality.
 *
 * Spec Section 4.3 — The Merge Gate
 * Spec Section 8.1 — UX Verification Teams
 * Spec Section 8.4 — Six-Layer Verification Pyramid
 * Spec Section 10.1 — What "Done" Means
 */

// ---------------------------------------------------------------------------
// Merge gate
// ---------------------------------------------------------------------------

/** Result of a single merge gate check. */
export interface IMergeCheck {
  /** Which of the five checks this is. */
  readonly check: MergeCheckType;
  /** Whether the check passed. */
  readonly passed: boolean;
  /** Diagnostic output when the check fails. */
  readonly diagnostics: readonly string[];
}

/**
 * The five checks in the merge gate.
 * Spec Section 4.3 — every merge passes through these five checks.
 */
export type MergeCheckType =
  | "scope"           // Check 1 — every modified file within agent's scope
  | "lsp"             // Check 2 — type errors, missing imports, syntax issues
  | "contract"        // Check 3 — interface contract conformance
  | "test"            // Check 4 — relevant test execution
  | "banned-pattern"; // Check 5 — anti-slop linter for UI-touching code

/**
 * IMergeGateResult — the five-check merge gate output.
 *
 * Every merge from an agent's working branch to the integration branch
 * passes through this gate. All five checks must pass for the merge to proceed.
 *
 * Spec Section 4.3 — "Every merge from an agent's working branch to
 * integration passes through a five-check gate."
 */
export interface IMergeGateResult {
  /** Unique identifier for this merge attempt. */
  readonly id: string;
  /** The build this merge belongs to. */
  readonly buildId: string;
  /** The agent session that submitted this merge. */
  readonly agentId: string;
  /** The goal this merge fulfills. */
  readonly goalId: string;
  /** Source branch (agent's working branch). */
  readonly sourceBranch: string;
  /** Target branch (build integration branch). */
  readonly targetBranch: string;

  /** Whether all five checks passed. */
  readonly passed: boolean;
  /** Individual check results. */
  readonly checks: readonly IMergeCheck[];

  /** When this merge attempt was evaluated. */
  readonly evaluatedAt: Date;
  /** Commit SHA if the merge succeeded. */
  readonly mergeCommitSha: string | null;
}

// ---------------------------------------------------------------------------
// UX verification
// ---------------------------------------------------------------------------

/** Severity classification for UX issues. Spec Section 8.2. */
export type UXIssueSeverity = "critical" | "high" | "medium" | "low";

/** A single UX issue found by a verification team. */
export interface IUXIssue {
  readonly id: string;
  readonly severity: UXIssueSeverity;
  /** What the Navigator saw. */
  readonly navigatorObservation: string;
  /** What the Inspector found in logs/network. */
  readonly inspectorDiagnostic: string;
  /** The user journey this issue was found in. */
  readonly journey: string;
  /** Whether this issue has been resolved. */
  readonly resolved: boolean;
}

/**
 * Report produced by a UX Verification Team (Navigator + Inspector).
 * Spec Section 8.1 — two-agent pairs that test the app as a human would.
 */
export interface IUXReport {
  readonly id: string;
  readonly buildId: string;
  /** The user journey tested. */
  readonly journey: string;
  /** Issues found during this verification. */
  readonly issues: readonly IUXIssue[];
  /** Whether this was a mid-build verification or comprehensive end-of-build. */
  readonly verificationType: "mid-build" | "comprehensive";
  /** Overall pass/fail — passes if no unresolved critical or high issues. */
  readonly passed: boolean;
  readonly evaluatedAt: Date;
}

// ---------------------------------------------------------------------------
// Completeness Verification System (CVS)
// ---------------------------------------------------------------------------

/**
 * CVS result — the final completeness assessment.
 * Spec Section 10.1 — What "Done" Means.
 */
export interface ICVSResult {
  readonly buildId: string;
  /** Percentage of explicit features implemented and functional. */
  readonly explicitCoverage: number;
  /** Percentage of inferred needs implemented. */
  readonly inferredCoverage: number;
  /** Intent verification score — does the app match the original prompt? */
  readonly intentScore: number;
  /** Design quality score (1-10). Spec Section 7.4. */
  readonly designQualityScore: number;
  /** Whether all user journeys have been verified. */
  readonly allJourneysVerified: boolean;
  /** Unresolved critical/high UX issues. */
  readonly unresolvedHighIssues: readonly IUXIssue[];
  /** Integration build passes (types, lint, tests, security). */
  readonly integrationPassing: boolean;
  /** Overall: is the build "done" per spec 10.1? */
  readonly complete: boolean;
}
