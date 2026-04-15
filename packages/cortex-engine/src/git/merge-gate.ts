/**
 * Merge gate — the five-check gate that every merge from an agent's
 * working branch to the integration branch must pass through.
 *
 * Spec Section 4.3 — The Merge Gate:
 *   Check 1: Scope verification
 *   Check 2: LSP/TypeScript verification
 *   Check 3: Interface contract verification
 *   Check 4: Test execution
 *   Check 5: Banned pattern enforcement (UI-touching code)
 *
 * Each check is independent. All five must pass for the merge to proceed.
 * Failed merges are rejected with full diagnostics so the agent can fix
 * the issues autonomously.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  IMergeRequest,
  IMergeGateResult,
  IMergeCheck,
  MergeCheckType,
  IMergeGate,
  IMergeGateCheckDetail,
  IScopeCheckResult,
  ILSPCheckResult,
  ILSPDiagnostic,
  IContractCheckResult,
  IContractViolation,
  ITestCheckResult,
  ITestFailure,
  IBannedPatternCheckResult,
  IBannedPatternViolation,
  IBannedPatternConfig,
  IAntiSlopLinter,
} from "@kriptik/shared-interfaces";
import { checkScope } from "./scope-enforcer.js";
import type { BranchManager } from "./branch-manager.js";

const execFileAsync = promisify(execFile);

/** Options for creating a MergeGate instance. */
export interface MergeGateOptions {
  /** Absolute path to the git repository root. */
  readonly repoPath: string;
  /** The branch manager for git operations. */
  readonly branchManager: BranchManager;
  /**
   * Anti-slop linter for Check 5 (Phase B, Step 11).
   * When provided, the merge gate delegates Check 5 entirely to this linter.
   * When absent, falls back to the legacy IBannedPatternConfig matching.
   */
  readonly antiSlopLinter?: IAntiSlopLinter;
  /** Banned pattern configuration for Check 5 (legacy fallback). */
  readonly bannedPatterns?: IBannedPatternConfig;
  /** Path to tsconfig for LSP check. Default: "tsconfig.json". */
  readonly tsconfigPath?: string;
  /** Test command to run. Default: "npx vitest run --reporter=json". */
  readonly testCommand?: readonly string[];
}

/**
 * Orchestrates the five-check merge gate.
 *
 * Runs checks in order: scope → LSP → contract → test → banned-pattern.
 * Each check produces diagnostics that are returned to the submitting agent
 * so it can fix issues autonomously.
 */
export class MergeGate implements IMergeGate {
  private readonly repoPath: string;
  private readonly branchManager: BranchManager;
  private readonly antiSlopLinter: IAntiSlopLinter | null;
  private readonly bannedPatterns: IBannedPatternConfig;
  private readonly tsconfigPath: string;
  private readonly testCommand: readonly string[];
  private _mergeSequence = 0;

  constructor(options: MergeGateOptions) {
    this.repoPath = options.repoPath;
    this.branchManager = options.branchManager;
    this.antiSlopLinter = options.antiSlopLinter ?? null;
    this.bannedPatterns = options.bannedPatterns ?? DEFAULT_BANNED_PATTERNS;
    this.tsconfigPath = options.tsconfigPath ?? "tsconfig.json";
    this.testCommand = options.testCommand ?? [
      "npx",
      "vitest",
      "run",
      "--reporter=json",
    ];
  }

  /**
   * Run all five checks against a merge request.
   * Checks run in sequence — early failure still runs remaining checks
   * to give the agent complete diagnostic information.
   *
   * Branch safety: saves the current branch before checking out the
   * source branch, and restores it in a finally block so callers are
   * never left on an unexpected branch.
   */
  async evaluate(request: IMergeRequest): Promise<IMergeGateResult> {
    const id = `merge-${++this._mergeSequence}`;
    const checks: IMergeCheck[] = [];

    // Get modified files once — used by multiple checks
    const modifiedFiles = await this.branchManager.getModifiedFiles(
      request.sourceBranch,
      request.targetBranch,
    );

    // Save the current branch so we can restore it after all checks
    const originalBranch = await this.getCurrentBranch();

    try {
      // Checkout the source branch ONCE for all checks that need it
      await this.exec("git", ["checkout", request.sourceBranch]);

      // Check 1: Scope verification (pure — doesn't need checkout)
      const scopeDetail = await this.runScopeCheck(
        modifiedFiles,
        request.goal.scopedWritePaths,
      );
      checks.push(toMergeCheck("scope", scopeDetail));

      // Check 2: LSP/TypeScript verification (runs against checked-out source)
      const lspDetail = await this.runLSPCheck();
      checks.push(toMergeCheck("lsp", lspDetail));

      // Check 3: Interface contract verification
      const contractDetail = await this.runContractCheck(modifiedFiles);
      checks.push(toMergeCheck("contract", contractDetail));

      // Check 4: Test execution
      const testDetail = await this.runTestCheck();
      checks.push(toMergeCheck("test", testDetail));

      // Check 5: Banned pattern enforcement
      const bannedDetail = await this.runBannedPatternCheck(modifiedFiles);
      checks.push(toMergeCheck("banned-pattern", bannedDetail));
    } finally {
      // Always restore the original branch, even if checks threw
      await this.exec("git", ["checkout", originalBranch]).catch(() => {
        // Best-effort restore — if this fails too, the repo is in a bad state
        // but we shouldn't mask the original error
      });
    }

    const allPassed = checks.every((c) => c.passed);

    // If all checks pass, perform the actual merge
    let mergeCommitSha: string | null = null;
    if (allPassed) {
      mergeCommitSha = await this.branchManager.merge(
        request.sourceBranch,
        request.targetBranch,
        `merge: ${request.goalId} from agent ${request.agentId}`,
      );
    }

    return {
      id,
      buildId: request.buildId,
      agentId: request.agentId,
      goalId: request.goalId,
      sourceBranch: request.sourceBranch,
      targetBranch: request.targetBranch,
      passed: allPassed,
      checks,
      evaluatedAt: new Date(),
      mergeCommitSha,
    };
  }

  /**
   * Run a single check. Useful for pre-flight validation before
   * a full merge gate evaluation.
   *
   * Handles branch checkout/restore internally so the caller's
   * branch is never polluted.
   */
  async runCheck(
    check: MergeCheckType,
    request: IMergeRequest,
  ): Promise<IMergeGateCheckDetail> {
    const modifiedFiles = await this.branchManager.getModifiedFiles(
      request.sourceBranch,
      request.targetBranch,
    );

    // Checks that need filesystem access run against the source branch.
    // Scope check is pure (no filesystem), but the rest need checkout.
    const needsCheckout = check !== "scope";
    const originalBranch = needsCheckout ? await this.getCurrentBranch() : null;

    try {
      if (needsCheckout) {
        await this.exec("git", ["checkout", request.sourceBranch]);
      }

      switch (check) {
        case "scope": {
          const detail = await this.runScopeCheck(
            modifiedFiles,
            request.goal.scopedWritePaths,
          );
          return {
            check,
            passed: detail.passed,
            diagnostics: scopeDiagnostics(detail),
            detail,
          };
        }
        case "lsp": {
          const detail = await this.runLSPCheck();
          return {
            check,
            passed: detail.passed,
            diagnostics: lspDiagnostics(detail),
            detail,
          };
        }
        case "contract": {
          const detail = await this.runContractCheck(modifiedFiles);
          return {
            check,
            passed: detail.passed,
            diagnostics: contractDiagnostics(detail),
            detail,
          };
        }
        case "test": {
          const detail = await this.runTestCheck();
          return {
            check,
            passed: detail.passed,
            diagnostics: testDiagnostics(detail),
            detail,
          };
        }
        case "banned-pattern": {
          const detail = await this.runBannedPatternCheck(modifiedFiles);
          return {
            check,
            passed: detail.passed,
            diagnostics: bannedPatternDiagnostics(detail),
            detail,
          };
        }
        default: {
          // Exhaustiveness guard — should never be reached
          const _exhaustive: never = check;
          throw new Error(`Unknown check type: ${_exhaustive}`);
        }
      }
    } finally {
      if (originalBranch) {
        await this.exec("git", ["checkout", originalBranch]).catch(() => {});
      }
    }
  }

  // -----------------------------------------------------------------------
  // Check 1: Scope verification
  // -----------------------------------------------------------------------

  private async runScopeCheck(
    modifiedFiles: readonly string[],
    allowedPaths: readonly string[],
  ): Promise<IScopeCheckResult> {
    return checkScope(modifiedFiles, allowedPaths);
  }

  // -----------------------------------------------------------------------
  // Check 2: LSP/TypeScript verification
  // -----------------------------------------------------------------------

  /**
   * Run TypeScript type checking against the currently checked-out branch.
   * Uses tsc --noEmit to check types without producing output.
   * Caller is responsible for ensuring the correct branch is checked out.
   */
  private async runLSPCheck(): Promise<ILSPCheckResult> {
    try {
      const { stdout, stderr } = await this.execNoThrow("npx", [
        "tsc",
        "--noEmit",
        "--pretty",
        "false",
        "-p",
        this.tsconfigPath,
      ]);

      const output = stdout + stderr;
      const errors = parseTscOutput(output);

      return {
        passed: errors.length === 0,
        errors,
        errorCount: errors.length,
      };
    } catch (error) {
      return {
        passed: false,
        errors: [
          {
            file: "<tsc>",
            line: 0,
            column: 0,
            message: `TypeScript check failed to run: ${error instanceof Error ? error.message : String(error)}`,
            code: "INTERNAL",
            severity: "error",
          },
        ],
        errorCount: 1,
      };
    }
  }

  // -----------------------------------------------------------------------
  // Check 3: Interface contract verification
  // -----------------------------------------------------------------------

  /**
   * Verify that modified files conform to interface contracts.
   *
   * This checks that any file implementing an interface from
   * shared-interfaces actually imports and uses the interface
   * rather than creating ad-hoc shapes that might drift.
   *
   * A full implementation would use the TypeScript compiler API
   * to verify structural conformance. This initial version checks:
   * 1. Files that import from @kriptik/shared-interfaces are valid
   * 2. Modified interface files haven't broken the contract
   */
  private async runContractCheck(
    modifiedFiles: readonly string[],
  ): Promise<IContractCheckResult> {
    const violations: IContractViolation[] = [];

    try {
      for (const file of modifiedFiles) {
        // Only check TypeScript files
        if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;

        // Skip test files
        if (file.includes(".test.") || file.includes("__tests__")) continue;

        try {
          const content = await readFile(join(this.repoPath, file), "utf-8");

          // Check: if file is in shared-interfaces, it should only export types/interfaces
          if (file.startsWith("packages/shared-interfaces/src/")) {
            const implementationPatterns = [
              /^export\s+(?:class|function)\s+/m,
              /^export\s+default\s+(?:class|function)\s+/m,
              /^export\s+const\s+\w+\s*=\s*(?:new|function|\()/m,
            ];

            for (const pattern of implementationPatterns) {
              if (pattern.test(content)) {
                violations.push({
                  contractPath: "packages/shared-interfaces/",
                  violatingFile: file,
                  description:
                    "shared-interfaces must contain only types and interfaces, not implementation code",
                });
                break;
              }
            }
          }

          // Check: imports from @kriptik/shared-interfaces should use type imports
          const nonTypeImportPattern =
            /^import\s+\{(?!\s*type\b)[^}]+\}\s+from\s+["']@kriptik\/shared-interfaces/m;
          if (
            nonTypeImportPattern.test(content) &&
            !file.startsWith("packages/shared-interfaces/")
          ) {
            violations.push({
              contractPath: "@kriptik/shared-interfaces",
              violatingFile: file,
              description:
                "Imports from @kriptik/shared-interfaces should use 'import type' to enforce the contract boundary",
            });
          }
        } catch {
          // File might not exist at this path (deleted file)
        }
      }
    } catch (error) {
      violations.push({
        contractPath: "<contract-check>",
        violatingFile: "<unknown>",
        description: `Contract check failed to run: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    return {
      passed: violations.length === 0,
      violations,
    };
  }

  // -----------------------------------------------------------------------
  // Check 4: Test execution
  // -----------------------------------------------------------------------

  /**
   * Run tests relevant to the modified files.
   */
  private async runTestCheck(): Promise<ITestCheckResult> {
    try {
      const { stdout, stderr, exitCode } = await this.execNoThrow(
        this.testCommand[0]!,
        this.testCommand.slice(1) as string[],
      );

      const output = stdout + stderr;
      return parseTestOutput(output, exitCode);
    } catch (error) {
      return {
        passed: false,
        testsRun: 0,
        testsPassed: 0,
        testsFailed: 1,
        failures: [
          {
            testName: "<test-runner>",
            testFile: "<unknown>",
            message: `Test execution failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }

  // -----------------------------------------------------------------------
  // Check 5: Banned pattern enforcement
  // -----------------------------------------------------------------------

  /**
   * Check modified files for banned imports, hardcoded colors,
   * and other anti-slop violations.
   *
   * When an IAntiSlopLinter is configured (Phase B, Step 11), delegates
   * entirely to the linter and converts its richer ISlopLintResult to
   * IBannedPatternCheckResult. Otherwise falls back to the inline
   * IBannedPatternConfig matching.
   *
   * Spec Section 7.3, Layer 5 — merge gate binary enforcement.
   */
  private async runBannedPatternCheck(
    modifiedFiles: readonly string[],
  ): Promise<IBannedPatternCheckResult> {
    // Phase B, Step 11: delegate to the anti-slop linter when available
    if (this.antiSlopLinter) {
      const lintResult = await this.antiSlopLinter.lint(
        modifiedFiles,
        this.repoPath,
      );

      // Convert ISlopLintResult to IBannedPatternCheckResult.
      // Only error-severity violations block the merge gate.
      const violations: IBannedPatternViolation[] = lintResult.violations
        .filter((v) => v.severity === "error")
        .map((v) => ({
          file: v.file,
          line: v.line,
          pattern: v.patternId,
          reason: `${v.description} ${v.suggestion}`,
        }));

      return {
        passed: violations.length === 0,
        violations,
      };
    }

    // Legacy fallback: inline pattern matching from Step 2
    return this.runLegacyBannedPatternCheck(modifiedFiles);
  }

  /**
   * Legacy banned pattern check (pre-Step 11).
   * Retained as fallback when no IAntiSlopLinter is configured.
   */
  private async runLegacyBannedPatternCheck(
    modifiedFiles: readonly string[],
  ): Promise<IBannedPatternCheckResult> {
    const violations: IBannedPatternViolation[] = [];

    try {
      // Filter to applicable files
      const applicableFiles = modifiedFiles.filter((f) =>
        this.bannedPatterns.applicableGlobs.some((glob) =>
          fileMatchesGlob(f, glob),
        ),
      );

      for (const file of applicableFiles) {
        try {
          const content = await readFile(join(this.repoPath, file), "utf-8");
          const lines = content.split("\n");

          // Check banned imports
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]!;

            for (const bannedImport of this.bannedPatterns.bannedImports) {
              if (
                line.includes(`from "${bannedImport}"`) ||
                line.includes(`from '${bannedImport}'`) ||
                line.includes(`require("${bannedImport}")`) ||
                line.includes(`require('${bannedImport}')`)
              ) {
                violations.push({
                  file,
                  line: i + 1,
                  pattern: `import from "${bannedImport}"`,
                  reason: `"${bannedImport}" is a banned import`,
                });
              }
            }

            // Check banned code patterns
            for (const banned of this.bannedPatterns.bannedCodePatterns) {
              const regex = new RegExp(banned.pattern);
              if (regex.test(line)) {
                violations.push({
                  file,
                  line: i + 1,
                  pattern: banned.pattern,
                  reason: banned.reason,
                });
              }
            }
          }
        } catch {
          // File might not exist (deleted file in diff)
        }
      }
    } catch (error) {
      violations.push({
        file: "<banned-pattern-check>",
        line: 0,
        pattern: "<internal>",
        reason: `Banned pattern check failed to run: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    return {
      passed: violations.length === 0,
      violations,
    };
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /** Get the name of the currently checked-out branch. */
  private async getCurrentBranch(): Promise<string> {
    const { stdout } = await this.exec("git", [
      "rev-parse",
      "--abbrev-ref",
      "HEAD",
    ]);
    return stdout.trim();
  }

  private async exec(
    cmd: string,
    args: string[],
  ): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync(cmd, args, {
      cwd: this.repoPath,
      maxBuffer: 10 * 1024 * 1024,
    });
  }

  /**
   * Execute a command that might fail with a non-zero exit code.
   * Returns stdout/stderr/exitCode without throwing.
   */
  private async execNoThrow(
    cmd: string,
    args: string[],
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
      const result = await execFileAsync(cmd, args, {
        cwd: this.repoPath,
        maxBuffer: 10 * 1024 * 1024,
      });
      return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
    } catch (error: unknown) {
      // execFile throws on non-zero exit; extract stdout/stderr/code from the error
      const execError = error as {
        stdout?: string;
        stderr?: string;
        code?: number;
      };
      return {
        stdout: execError.stdout ?? "",
        stderr: execError.stderr ?? "",
        exitCode: typeof execError.code === "number" ? execError.code : 1,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Diagnostic formatters
// ---------------------------------------------------------------------------

function toMergeCheck(
  check: MergeCheckType,
  detail:
    | IScopeCheckResult
    | ILSPCheckResult
    | IContractCheckResult
    | ITestCheckResult
    | IBannedPatternCheckResult,
): IMergeCheck {
  let diagnostics: readonly string[];

  switch (check) {
    case "scope":
      diagnostics = scopeDiagnostics(detail as IScopeCheckResult);
      break;
    case "lsp":
      diagnostics = lspDiagnostics(detail as ILSPCheckResult);
      break;
    case "contract":
      diagnostics = contractDiagnostics(detail as IContractCheckResult);
      break;
    case "test":
      diagnostics = testDiagnostics(detail as ITestCheckResult);
      break;
    case "banned-pattern":
      diagnostics = bannedPatternDiagnostics(
        detail as IBannedPatternCheckResult,
      );
      break;
  }

  return { check, passed: detail.passed, diagnostics };
}

function scopeDiagnostics(result: IScopeCheckResult): string[] {
  if (result.passed) return [];
  return result.outOfScopeFiles.map(
    (f) =>
      `Out-of-scope file: ${f} (allowed: ${result.allowedPaths.join(", ")})`,
  );
}

function lspDiagnostics(result: ILSPCheckResult): string[] {
  if (result.passed) return [];
  return result.errors.map(
    (e) => `${e.file}:${e.line}:${e.column} - ${e.severity} TS${e.code}: ${e.message}`,
  );
}

function contractDiagnostics(result: IContractCheckResult): string[] {
  if (result.passed) return [];
  return result.violations.map(
    (v) =>
      `Contract violation in ${v.violatingFile}: ${v.description} (contract: ${v.contractPath})`,
  );
}

function testDiagnostics(result: ITestCheckResult): string[] {
  if (result.passed) return [];
  return result.failures.map(
    (f) =>
      `FAIL ${f.testFile} > ${f.testName}: ${f.message}${f.stack ? "\n" + f.stack : ""}`,
  );
}

function bannedPatternDiagnostics(result: IBannedPatternCheckResult): string[] {
  if (result.passed) return [];
  return result.violations.map(
    (v) => `${v.file}:${v.line} - Banned pattern "${v.pattern}": ${v.reason}`,
  );
}

// ---------------------------------------------------------------------------
// Output parsers
// ---------------------------------------------------------------------------

/**
 * Parse TypeScript compiler output into structured diagnostics.
 * Handles the format: file(line,col): error TSxxxx: message
 */
function parseTscOutput(output: string): ILSPDiagnostic[] {
  const diagnostics: ILSPDiagnostic[] = [];
  const errorPattern = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/gm;

  let match;
  while ((match = errorPattern.exec(output)) !== null) {
    diagnostics.push({
      file: match[1]!,
      line: parseInt(match[2]!, 10),
      column: parseInt(match[3]!, 10),
      message: match[6]!,
      code: match[5]!,
      severity: match[4] as "error" | "warning",
    });
  }

  return diagnostics;
}

/**
 * Parse test runner output. Attempts JSON first (vitest --reporter=json),
 * falls back to counting pass/fail patterns.
 *
 * @param exitCode — the test command's exit code. When no recognizable
 * test patterns are found in the output, the exit code determines
 * pass/fail: exit 0 = no tests to run (pass), non-zero = failure.
 */
function parseTestOutput(output: string, exitCode: number = 0): ITestCheckResult {
  // Try parsing as vitest JSON output
  try {
    const jsonMatch = output.match(/\{[\s\S]*"testResults"[\s\S]*\}/);
    if (jsonMatch) {
      const json = JSON.parse(jsonMatch[0]) as {
        numPassedTests?: number;
        numFailedTests?: number;
        numTotalTests?: number;
        testResults?: Array<{
          assertionResults?: Array<{
            status?: string;
            fullName?: string;
            ancestorTitles?: string[];
            failureMessages?: string[];
          }>;
          name?: string;
        }>;
      };

      const failures: ITestFailure[] = [];
      for (const suite of json.testResults ?? []) {
        for (const test of suite.assertionResults ?? []) {
          if (test.status === "failed") {
            failures.push({
              testName: test.fullName ?? "unknown",
              testFile: suite.name ?? "unknown",
              message: (test.failureMessages ?? []).join("\n"),
            });
          }
        }
      }

      const totalTests = json.numTotalTests ?? 0;
      const failedTests = json.numFailedTests ?? failures.length;
      const passedTests = json.numPassedTests ?? totalTests - failedTests;

      return {
        passed: failedTests === 0,
        testsRun: totalTests,
        testsPassed: passedTests,
        testsFailed: failedTests,
        failures,
      };
    }
  } catch {
    // JSON parsing failed, fall through to pattern matching
  }

  // Fallback: look for common test runner output patterns
  const passMatch = output.match(/(\d+)\s+pass/i);
  const failMatch = output.match(/(\d+)\s+fail/i);

  const passed = parseInt(passMatch?.[1] ?? "0", 10);
  const failed = parseInt(failMatch?.[1] ?? "0", 10);

  // No recognizable test output — use exit code to determine outcome.
  // Exit 0 = no tests to run (pass). Non-zero = something failed.
  if (!passMatch && !failMatch && !output.includes("FAIL")) {
    if (exitCode !== 0) {
      return {
        passed: false,
        testsRun: 0,
        testsPassed: 0,
        testsFailed: 1,
        failures: [
          {
            testName: "<unparseable-output>",
            testFile: "<unknown>",
            message: `Test command exited with code ${exitCode} but output could not be parsed. Raw output available in diagnostics.`,
          },
        ],
      };
    }
    return {
      passed: true,
      testsRun: 0,
      testsPassed: 0,
      testsFailed: 0,
      failures: [],
    };
  }

  return {
    passed: failed === 0,
    testsRun: passed + failed,
    testsPassed: passed,
    testsFailed: failed,
    failures:
      failed > 0
        ? [
            {
              testName: "<see-output>",
              testFile: "<see-output>",
              message: `${failed} test(s) failed. Full output available in diagnostics.`,
            },
          ]
        : [],
  };
}

// ---------------------------------------------------------------------------
// Glob matching for banned pattern file filtering
// ---------------------------------------------------------------------------

function fileMatchesGlob(filePath: string, glob: string): boolean {
  const regexStr = glob
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "<<<DOUBLESTAR>>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<<DOUBLESTAR>>>/g, ".*");

  return new RegExp(`^${regexStr}$`).test(filePath);
}

// ---------------------------------------------------------------------------
// Default banned pattern configuration
// ---------------------------------------------------------------------------

/**
 * Default banned patterns per spec Section 4.3, Check 5.
 * These are the initial anti-slop rules. The Architect can extend
 * this configuration per-build via the design system.
 */
const DEFAULT_BANNED_PATTERNS: IBannedPatternConfig = {
  bannedImports: [
    "lucide-react",
    "@heroicons/react",
    "react-icons",
    "font-awesome",
  ],
  bannedCodePatterns: [
    {
      pattern: "#[0-9a-fA-F]{6}(?!.*(?:var|theme|color-scheme))",
      reason:
        "Hardcoded hex color values. Use design system tokens or CSS variables instead.",
    },
    {
      pattern:
        "(?:rgb|rgba|hsl|hsla)\\s*\\(\\s*\\d+.*?\\)(?!.*(?:var|theme|color-scheme))",
      reason:
        "Hardcoded color functions. Use design system tokens or CSS variables instead.",
    },
  ],
  applicableGlobs: [
    "**/*.tsx",
    "**/*.jsx",
    "**/*.css",
    "**/*.scss",
    "**/*.module.css",
  ],
};
