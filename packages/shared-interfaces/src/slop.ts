/**
 * Anti-slop linter interfaces — detects AI-generated slop patterns
 * in code and UI output, powering both agent self-verification (Layer 4)
 * and merge gate Check 5 (Layer 5) of the Seven-Layer Design Enforcement Stack.
 *
 * Spec Section 7.3 — Seven-Layer Design Enforcement Stack:
 *   Layer 4: Agent's own verification — anti-slop linter runs alongside TypeScript checks
 *   Layer 5: Merge gate (binary) — blocks banned patterns, hard violations rejected
 *
 * Spec Section 4.3, Check 5 — "A lightweight linter checks for banned imports,
 * hardcoded color values, and other anti-slop config violations."
 *
 * Spec Section 7.2, Artifact 3 — The Anti-Slop Ruleset: "machine-readable
 * specification of banned patterns, required patterns, and quality thresholds."
 */

// ---------------------------------------------------------------------------
// Slop pattern classification
// ---------------------------------------------------------------------------

/**
 * Severity levels for slop pattern violations.
 *
 * - "error": Hard violation — merge gate rejects. Binary enforcement.
 * - "warning": Soft signal — agents should fix before merge, but not a gate blocker
 *   unless treatWarningsAsErrors is enabled.
 */
export type SlopSeverity = "error" | "warning";

/**
 * Categories for organizing slop patterns.
 *
 * These correspond to the pattern types described in spec Section 7.2
 * (Design Pioneer Artifact 3) and Section 7.3 Layer 5 enforcement.
 */
export type SlopCategory =
  | "placeholder-text"
  | "generic-comment"
  | "hardcoded-credential"
  | "commented-out-code"
  | "banned-import"
  | "hardcoded-color"
  | "default-ui-pattern"
  | "ai-slop-marker"
  | "custom";

// ---------------------------------------------------------------------------
// Pattern definitions
// ---------------------------------------------------------------------------

/**
 * A single slop pattern definition with regex, severity, and remediation guidance.
 *
 * Spec Section 7.2, Artifact 3 — each pattern in the Anti-Slop Ruleset includes
 * what's banned and why, so agents can fix issues autonomously.
 */
export interface ISlopPattern {
  /** Unique identifier for this pattern (e.g., "placeholder-lorem-ipsum"). */
  readonly id: string;
  /** Category this pattern belongs to. */
  readonly category: SlopCategory;
  /** Regex pattern to match against file contents (applied per-line). */
  readonly pattern: string;
  /** Whether violations are hard errors or soft warnings. */
  readonly severity: SlopSeverity;
  /** Human-readable description of what this pattern catches. */
  readonly description: string;
  /** What the agent should do instead — actionable remediation. */
  readonly suggestion: string;
  /** File globs this pattern applies to. Empty array = all files. */
  readonly applicableGlobs: readonly string[];
}

// ---------------------------------------------------------------------------
// Violation and result types
// ---------------------------------------------------------------------------

/**
 * A single slop violation found during linting.
 *
 * Provides enough context for agents to fix the issue autonomously:
 * file location, what was matched, why it's banned, and what to do instead.
 */
export interface ISlopViolation {
  /** ID of the pattern that triggered this violation. */
  readonly patternId: string;
  /** Category of the violated pattern. */
  readonly category: SlopCategory;
  /** Severity of the violation. */
  readonly severity: SlopSeverity;
  /** File path (relative to repo root). */
  readonly file: string;
  /** Line number (1-based). */
  readonly line: number;
  /** Column number (1-based). */
  readonly column: number;
  /** The text that matched the pattern. */
  readonly matchedText: string;
  /** Human-readable description of what was caught. */
  readonly description: string;
  /** Actionable remediation suggestion. */
  readonly suggestion: string;
}

/**
 * Result of a linting pass over one or more files.
 *
 * The `passed` field reflects merge gate semantics: false if any error-severity
 * violations exist (or any warnings when treatWarningsAsErrors is enabled).
 */
export interface ISlopLintResult {
  /** Whether the lint pass passed (no blocking violations). */
  readonly passed: boolean;
  /** All violations found, ordered by file then line number. */
  readonly violations: readonly ISlopViolation[];
  /** Number of files that were linted. */
  readonly fileCount: number;
  /** Number of patterns that were checked. */
  readonly patternCount: number;
  /** Count of error-severity violations. */
  readonly errorCount: number;
  /** Count of warning-severity violations. */
  readonly warningCount: number;
}

// ---------------------------------------------------------------------------
// Linter configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for the anti-slop linter.
 *
 * Supports both default patterns (from slop-patterns.ts) and project-specific
 * overrides (from the Design Pioneer's Anti-Slop Ruleset, Artifact 3).
 */
export interface ISlopLinterConfig {
  /** Slop patterns to check. Includes defaults + any project-specific additions. */
  readonly patterns: readonly ISlopPattern[];
  /** When true, warning-severity violations also block the merge gate. */
  readonly treatWarningsAsErrors: boolean;
  /** File globs to always exclude from linting (e.g., test fixtures, vendor). */
  readonly excludeGlobs: readonly string[];
}

// ---------------------------------------------------------------------------
// Linter interface
// ---------------------------------------------------------------------------

/**
 * IAntiSlopLinter — detects AI-generated slop patterns in code and UI output.
 *
 * Used in two contexts:
 * 1. **Layer 4 (agent self-check):** Agents run the linter before submitting
 *    a merge to catch issues early. Uses `lintContent()` for single files or
 *    `lint()` for batch checking.
 * 2. **Layer 5 (merge gate Check 5):** The merge gate delegates to the linter
 *    for banned pattern enforcement. Uses `lint()` with the modified file list.
 *
 * Spec Section 7.3, Layers 4-5.
 * Spec Section 4.3, Check 5.
 */
export interface IAntiSlopLinter {
  /**
   * Lint multiple files from the repository.
   * Reads file contents from disk using repoPath as the root.
   *
   * @param files - File paths relative to repo root.
   * @param repoPath - Absolute path to the repository root.
   */
  lint(files: readonly string[], repoPath: string): Promise<ISlopLintResult>;

  /**
   * Lint a single file's content without filesystem access.
   * Useful for agent self-checks during generation (Layer 4).
   *
   * @param content - The file content to lint.
   * @param filePath - The file path (used for glob matching and diagnostics).
   */
  lintContent(content: string, filePath: string): ISlopLintResult;

  /**
   * Get the current set of active patterns.
   */
  getPatterns(): readonly ISlopPattern[];

  /**
   * Add a project-specific pattern at runtime.
   * Used when the Design Pioneer produces its Anti-Slop Ruleset (Artifact 3).
   */
  addPattern(pattern: ISlopPattern): void;

  /**
   * Remove a pattern by ID.
   * Used when the Architect overrides default patterns for a specific build.
   */
  removePattern(patternId: string): void;
}
