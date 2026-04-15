/**
 * Git repository management interfaces — branch isolation, scope enforcement,
 * and merge operations for the shared repository layer.
 *
 * Spec Section 4.2 — Tier 2: Shared Repository Layer
 * Spec Section 4.3 — The Merge Gate
 * Spec Section 4.4 — Handling Conflict-Prone Shared Files
 */

import type { IGoalAssignment } from "./agents.js";
import type { IMergeGateResult, MergeCheckType } from "./verification.js";

// ---------------------------------------------------------------------------
// Branch structure
// ---------------------------------------------------------------------------

/**
 * Branch naming convention per spec Section 4.2:
 *
 * main
 *  └── build-{id}/integration          ← merge target for all agents
 *       ├── build-{id}/auth             ← Builder-Auth's working branch
 *       ├── build-{id}/db               ← Builder-DB's working branch
 *       └── build-{id}/compete/auth-a   ← Competitive generation fork A
 */

/** Metadata for a build's branch structure. */
export interface IBuildBranches {
  /** The build ID these branches belong to. */
  readonly buildId: string;
  /** Integration branch name (e.g. "build-abc123/integration"). */
  readonly integrationBranch: string;
  /** Map of agent IDs to their working branch names. */
  readonly agentBranches: ReadonlyMap<string, string>;
  /** Current commit SHA of the integration branch. */
  readonly integrationHead: string;
}

// ---------------------------------------------------------------------------
// Scope enforcement
// ---------------------------------------------------------------------------

/**
 * Result of a scope check — verifying that an agent only modified
 * files within its scopedWritePaths.
 *
 * Spec Section 4.3, Check 1 — "Every modified file must be within the
 * agent's scope definition set by the Architect."
 */
export interface IScopeCheckResult {
  /** Whether all modified files are within scope. */
  readonly passed: boolean;
  /** Files that were modified. */
  readonly modifiedFiles: readonly string[];
  /** Files that are within scope. */
  readonly inScopeFiles: readonly string[];
  /** Files that are OUT of scope — these caused the failure. */
  readonly outOfScopeFiles: readonly string[];
  /** The allowed write paths for this agent. */
  readonly allowedPaths: readonly string[];
}

// ---------------------------------------------------------------------------
// Merge request
// ---------------------------------------------------------------------------

/**
 * A request to merge an agent's working branch into the integration branch.
 * Submitted by an agent when it believes its goal is complete.
 *
 * Spec Section 4.3 — "Every merge from an agent's working branch to
 * integration passes through a five-check gate."
 */
export interface IMergeRequest {
  /** The build this merge belongs to. */
  readonly buildId: string;
  /** The agent session submitting this merge. */
  readonly agentId: string;
  /** The goal this merge fulfills. */
  readonly goalId: string;
  /** Source branch (agent's working branch). */
  readonly sourceBranch: string;
  /** Target branch (build integration branch). */
  readonly targetBranch: string;
  /** The goal assignment — contains scopedWritePaths for Check 1. */
  readonly goal: IGoalAssignment;
}

// ---------------------------------------------------------------------------
// Individual check results
// ---------------------------------------------------------------------------

/**
 * Result of the LSP/TypeScript verification check.
 * Spec Section 4.3, Check 2 — "The merged code is checked by the language
 * server in a shadow workspace."
 */
export interface ILSPCheckResult {
  readonly passed: boolean;
  /** TypeScript compiler errors, if any. */
  readonly errors: readonly ILSPDiagnostic[];
  /** Number of errors. */
  readonly errorCount: number;
}

/** A single diagnostic from the TypeScript language server. */
export interface ILSPDiagnostic {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
  readonly code: string | number;
  readonly severity: "error" | "warning";
}

/**
 * Result of the interface contract verification check.
 * Spec Section 4.3, Check 3 — "The merged code is checked against the
 * Architect's blueprint contracts."
 */
export interface IContractCheckResult {
  readonly passed: boolean;
  /** Contract violations found. */
  readonly violations: readonly IContractViolation[];
}

/** A single contract violation. */
export interface IContractViolation {
  /** The contract that was violated. */
  readonly contractPath: string;
  /** The file that violated the contract. */
  readonly violatingFile: string;
  /** Human-readable description of the violation. */
  readonly description: string;
}

/**
 * Result of the test execution check.
 * Spec Section 4.3, Check 4 — "The merged code's relevant tests are executed."
 */
export interface ITestCheckResult {
  readonly passed: boolean;
  /** Total number of tests run. */
  readonly testsRun: number;
  /** Number of tests that passed. */
  readonly testsPassed: number;
  /** Number of tests that failed. */
  readonly testsFailed: number;
  /** Details of failed tests. */
  readonly failures: readonly ITestFailure[];
}

/** A single test failure. */
export interface ITestFailure {
  readonly testName: string;
  readonly testFile: string;
  readonly message: string;
  readonly stack?: string;
}

/**
 * Result of the banned pattern enforcement check.
 * Spec Section 4.3, Check 5 — "A lightweight linter checks for banned
 * imports, hardcoded color values, and other anti-slop config violations."
 */
export interface IBannedPatternCheckResult {
  readonly passed: boolean;
  /** Banned pattern violations found. */
  readonly violations: readonly IBannedPatternViolation[];
}

/** A single banned pattern violation. */
export interface IBannedPatternViolation {
  readonly file: string;
  readonly line: number;
  readonly pattern: string;
  /** Why this pattern is banned. */
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// Banned pattern configuration
// ---------------------------------------------------------------------------

/** Configuration for banned pattern check (Check 5). */
export interface IBannedPatternConfig {
  /** Banned import patterns (e.g. "lucide-react"). */
  readonly bannedImports: readonly string[];
  /** Regex patterns for banned code (e.g. hardcoded color values). */
  readonly bannedCodePatterns: readonly IBannedCodePattern[];
  /** File globs that Check 5 applies to (default: UI-touching files). */
  readonly applicableGlobs: readonly string[];
}

/** A single banned code pattern with its regex and reason. */
export interface IBannedCodePattern {
  /** Regex pattern to match against file contents. */
  readonly pattern: string;
  /** Human-readable reason why this pattern is banned. */
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// Git repository manager interface
// ---------------------------------------------------------------------------

/**
 * IBuildRepository — manages the git repository for a single build.
 *
 * Handles branch lifecycle, scope enforcement, and merge operations.
 * This is the Tier 2 Shared Repository Layer from the spec.
 *
 * Spec Section 4.2 — "A single git repository is the codebase source of truth."
 * Spec Section 4.3 — "Every merge from an agent's working branch to integration
 * passes through a five-check gate."
 */
export interface IBuildRepository {
  /**
   * Initialize the branch structure for a new build.
   * Creates: build-{id}/integration branched from main.
   */
  initializeBuild(buildId: string): Promise<IBuildBranches>;

  /**
   * Create a working branch for an agent.
   * Creates: build-{id}/{branchSuffix} branched from integration.
   *
   * @param buildId - The build this agent belongs to.
   * @param agentId - The agent's unique identifier.
   * @param branchSuffix - Short name for the branch (e.g. "auth", "db", "billing").
   */
  createAgentBranch(
    buildId: string,
    agentId: string,
    branchSuffix: string,
  ): Promise<string>;

  /**
   * Get the current branch structure for a build.
   */
  getBuildBranches(buildId: string): Promise<IBuildBranches | null>;

  /**
   * Submit a merge request through the five-check gate.
   * Returns the gate result (passed or failed with diagnostics).
   *
   * Spec Section 4.3 — five-check merge gate.
   */
  submitMerge(request: IMergeRequest): Promise<IMergeGateResult>;

  /**
   * Check scope enforcement for an agent's modifications.
   * Compares modified files against the agent's scopedWritePaths.
   *
   * Spec Section 4.3, Check 1.
   */
  checkScope(
    agentId: string,
    sourceBranch: string,
    targetBranch: string,
    allowedPaths: readonly string[],
  ): Promise<IScopeCheckResult>;

  /**
   * Get the list of files modified between two branches.
   */
  getModifiedFiles(
    sourceBranch: string,
    targetBranch: string,
  ): Promise<readonly string[]>;

  /**
   * Sync an agent's working branch with the latest integration branch.
   * Rebases the agent branch on top of integration.
   */
  syncAgentBranch(
    agentBranch: string,
    integrationBranch: string,
  ): Promise<void>;

  /**
   * Clean up all branches for a completed build.
   */
  cleanupBuild(buildId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Merge gate interface
// ---------------------------------------------------------------------------

/**
 * IMergeGate — orchestrates the five-check merge gate.
 *
 * Each check is independent and runs in sequence. If any check fails,
 * the merge is rejected with full diagnostics.
 *
 * Spec Section 4.3 — five sequential checks:
 * 1. Scope verification
 * 2. LSP/TypeScript verification
 * 3. Interface contract verification
 * 4. Test execution
 * 5. Banned pattern enforcement (UI-touching code only)
 */
export interface IMergeGate {
  /**
   * Run all five checks against a merge request.
   * Returns the aggregate result with per-check diagnostics.
   */
  evaluate(request: IMergeRequest): Promise<IMergeGateResult>;

  /**
   * Run a single check. Useful for pre-flight validation.
   */
  runCheck(
    check: MergeCheckType,
    request: IMergeRequest,
  ): Promise<IMergeGateCheckDetail>;
}

/** Detailed result of a single merge gate check with typed output. */
export interface IMergeGateCheckDetail {
  readonly check: MergeCheckType;
  readonly passed: boolean;
  readonly diagnostics: readonly string[];
  /** Typed result for programmatic consumption. */
  readonly detail:
    | IScopeCheckResult
    | ILSPCheckResult
    | IContractCheckResult
    | ITestCheckResult
    | IBannedPatternCheckResult;
}
