/**
 * RequiredPatternChecker — checks for the PRESENCE of required patterns
 * defined in the Design Pioneer's Anti-Slop Ruleset.
 *
 * The inverse of the AntiSlopLinter: while banned patterns detect things
 * that MUST NOT exist, required patterns detect things that MUST exist.
 * A missing required pattern is a violation.
 *
 * Used by:
 *   Layer 4: Agent self-check before merge
 *   Layer 5: Merge gate integration — required pattern absence blocks merge
 *   Layer 7: Design quality scoring — required pattern coverage feeds the score
 *
 * Spec Section 7.2, Artifact 3 — "required patterns (SmoothScroll,
 * PageTransition, ScrollReveal on every page; hover/focus/active states
 * on every interactive element)"
 * Spec Section 7.3, Layers 4-5-7.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  IRequiredPattern,
  IRequiredPatternCheckResult,
  IRequiredPatternViolation,
  IRequiredPatternChecker,
} from "@kriptik/shared-interfaces";

export class RequiredPatternChecker implements IRequiredPatternChecker {
  async check(
    files: readonly string[],
    repoPath: string,
    patterns: readonly IRequiredPattern[],
  ): Promise<IRequiredPatternCheckResult> {
    const allMissing: IRequiredPatternViolation[] = [];
    const allPresent = new Set<string>();
    let fileCount = 0;

    for (const file of files) {
      try {
        const content = await readFile(join(repoPath, file), "utf-8");
        const result = this.checkContent(content, file, patterns);

        for (const missing of result.missingPatterns) {
          allMissing.push(missing);
        }
        for (const presentId of result.presentPatterns) {
          allPresent.add(presentId);
        }
        fileCount++;
      } catch {
        // File might not exist (deleted in diff) — skip
      }
    }

    return {
      passed: allMissing.length === 0,
      missingPatterns: allMissing,
      presentPatterns: [...allPresent],
      fileCount,
      patternCount: patterns.length,
    };
  }

  checkContent(
    content: string,
    filePath: string,
    patterns: readonly IRequiredPattern[],
  ): IRequiredPatternCheckResult {
    const missing: IRequiredPatternViolation[] = [];
    const present: string[] = [];

    const applicable = this.getApplicablePatterns(filePath, patterns);

    for (const pattern of applicable) {
      const regex = this.compilePattern(pattern.pattern);
      if (!regex) continue;

      if (regex.test(content)) {
        present.push(pattern.id);
      } else {
        missing.push({
          patternId: pattern.id,
          description: pattern.description,
          scope: pattern.scope,
          suggestion: pattern.suggestion,
          file: filePath,
        });
      }
    }

    return {
      passed: missing.length === 0,
      missingPatterns: missing,
      presentPatterns: present,
      fileCount: 1,
      patternCount: applicable.length,
    };
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /**
   * Get patterns applicable to a given file path.
   * Patterns with empty applicableGlobs match all files.
   */
  private getApplicablePatterns(
    filePath: string,
    patterns: readonly IRequiredPattern[],
  ): readonly IRequiredPattern[] {
    return patterns.filter((pattern) => {
      if (pattern.applicableGlobs.length === 0) return true;
      return pattern.applicableGlobs.some((glob) =>
        fileMatchesGlob(filePath, glob),
      );
    });
  }

  private compilePattern(pattern: string): RegExp | null {
    try {
      return new RegExp(pattern, "u");
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Glob matching (shared pattern with anti-slop-linter.ts and merge-gate.ts)
// ---------------------------------------------------------------------------

function fileMatchesGlob(filePath: string, glob: string): boolean {
  const regexStr = glob
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "<<<DOUBLESTAR>>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<<DOUBLESTAR>>>/g, ".*");

  return new RegExp(`^${regexStr}$`).test(filePath);
}
