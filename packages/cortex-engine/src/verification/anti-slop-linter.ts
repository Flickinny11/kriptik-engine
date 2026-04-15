/**
 * AntiSlopLinter — detects AI-generated slop patterns in code and UI output.
 *
 * Powers two layers of the Seven-Layer Design Enforcement Stack:
 *   Layer 4: Agent self-check — agents call lintContent() during generation
 *   Layer 5: Merge gate Check 5 — merge gate calls lint() on modified files
 *
 * The linter applies regex patterns per-line to file contents, producing
 * structured violations with actionable suggestions so agents can self-correct.
 *
 * Spec Section 7.3, Layers 4-5.
 * Spec Section 4.3, Check 5 — banned pattern enforcement.
 * Spec Section 7.2, Artifact 3 — Anti-Slop Ruleset.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  IAntiSlopLinter,
  ISlopPattern,
  ISlopViolation,
  ISlopLintResult,
  ISlopLinterConfig,
  IBannedPatternCheckResult,
  IBannedPatternViolation,
} from "@kriptik/shared-interfaces";
import {
  DEFAULT_SLOP_PATTERNS,
  DEFAULT_SLOP_LINTER_CONFIG,
} from "./slop-patterns.js";

/**
 * AntiSlopLinter implementation.
 *
 * Configurable with default patterns plus project-specific overrides.
 * Patterns can be added/removed at runtime when the Design Pioneer
 * produces its Anti-Slop Ruleset.
 */
export class AntiSlopLinter implements IAntiSlopLinter {
  private patterns: ISlopPattern[];
  private readonly treatWarningsAsErrors: boolean;
  private readonly excludeGlobs: readonly string[];

  constructor(config?: Partial<ISlopLinterConfig>) {
    this.patterns = [
      ...(config?.patterns ?? DEFAULT_SLOP_PATTERNS),
    ];
    this.treatWarningsAsErrors =
      config?.treatWarningsAsErrors ??
      DEFAULT_SLOP_LINTER_CONFIG.treatWarningsAsErrors;
    this.excludeGlobs =
      config?.excludeGlobs ?? DEFAULT_SLOP_LINTER_CONFIG.excludeGlobs;
  }

  /**
   * Lint multiple files from the repository.
   * Reads each file, applies applicable patterns, aggregates results.
   * Files matching excludeGlobs are skipped.
   */
  async lint(
    files: readonly string[],
    repoPath: string,
  ): Promise<ISlopLintResult> {
    const allViolations: ISlopViolation[] = [];
    let fileCount = 0;

    for (const file of files) {
      if (this.isExcluded(file)) continue;

      try {
        const content = await readFile(join(repoPath, file), "utf-8");
        const result = this.lintContent(content, file);
        allViolations.push(...result.violations);
        fileCount++;
      } catch {
        // File might not exist (deleted file in diff) — skip silently
      }
    }

    return this.buildResult(allViolations, fileCount);
  }

  /**
   * Lint a single file's content without filesystem access.
   * Applies all patterns whose applicableGlobs match the file path.
   */
  lintContent(content: string, filePath: string): ISlopLintResult {
    const violations: ISlopViolation[] = [];
    const lines = content.split("\n");
    const applicablePatterns = this.getApplicablePatterns(filePath);

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex]!;

      for (const pattern of applicablePatterns) {
        const regex = this.compilePattern(pattern.pattern);
        if (!regex) continue;

        const match = regex.exec(line);
        if (match) {
          violations.push({
            patternId: pattern.id,
            category: pattern.category,
            severity: pattern.severity,
            file: filePath,
            line: lineIndex + 1,
            column: match.index + 1,
            matchedText: match[0],
            description: pattern.description,
            suggestion: pattern.suggestion,
          });
        }
      }
    }

    return this.buildResult(violations, 1);
  }

  getPatterns(): readonly ISlopPattern[] {
    return [...this.patterns];
  }

  addPattern(pattern: ISlopPattern): void {
    // Replace if a pattern with the same ID already exists
    const existingIndex = this.patterns.findIndex((p) => p.id === pattern.id);
    if (existingIndex >= 0) {
      this.patterns[existingIndex] = pattern;
    } else {
      this.patterns.push(pattern);
    }
  }

  removePattern(patternId: string): void {
    this.patterns = this.patterns.filter((p) => p.id !== patternId);
  }

  // -----------------------------------------------------------------------
  // Merge gate integration — converts ISlopLintResult to IBannedPatternCheckResult
  // -----------------------------------------------------------------------

  /**
   * Convert a slop lint result to the merge gate's IBannedPatternCheckResult format.
   * This bridges the richer ISlopLintResult to the merge gate's simpler Check 5 type.
   *
   * Only error-severity violations (or warnings when treatWarningsAsErrors is set)
   * are included, since the merge gate is binary: pass or fail.
   */
  static toMergeGateResult(
    result: ISlopLintResult,
  ): IBannedPatternCheckResult {
    const violations: IBannedPatternViolation[] = result.violations
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

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /**
   * Get patterns applicable to a given file path.
   * Patterns with empty applicableGlobs match all files.
   */
  private getApplicablePatterns(filePath: string): ISlopPattern[] {
    return this.patterns.filter((pattern) => {
      if (pattern.applicableGlobs.length === 0) return true;
      return pattern.applicableGlobs.some((glob) =>
        fileMatchesGlob(filePath, glob),
      );
    });
  }

  /** Check if a file should be excluded from linting. */
  private isExcluded(filePath: string): boolean {
    return this.excludeGlobs.some((glob) => fileMatchesGlob(filePath, glob));
  }

  /** Compile a pattern string to a RegExp, returning null on invalid regex. */
  private compilePattern(pattern: string): RegExp | null {
    try {
      return new RegExp(pattern, "u");
    } catch {
      return null;
    }
  }

  /** Build an ISlopLintResult from a list of violations. */
  private buildResult(
    violations: ISlopViolation[],
    fileCount: number,
  ): ISlopLintResult {
    const errorCount = violations.filter((v) => v.severity === "error").length;
    const warningCount = violations.filter(
      (v) => v.severity === "warning",
    ).length;

    const passed = this.treatWarningsAsErrors
      ? errorCount === 0 && warningCount === 0
      : errorCount === 0;

    // Sort by file path, then line number for stable output
    violations.sort((a, b) => {
      const fileCmp = a.file.localeCompare(b.file);
      if (fileCmp !== 0) return fileCmp;
      return a.line - b.line;
    });

    return {
      passed,
      violations,
      fileCount,
      patternCount: this.patterns.length,
      errorCount,
      warningCount,
    };
  }
}

// ---------------------------------------------------------------------------
// Glob matching (mirrors the pattern from merge-gate.ts)
// ---------------------------------------------------------------------------

function fileMatchesGlob(filePath: string, glob: string): boolean {
  const regexStr = glob
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "<<<DOUBLESTAR>>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<<DOUBLESTAR>>>/g, ".*");

  return new RegExp(`^${regexStr}$`).test(filePath);
}
