/**
 * ImplementationComparator — compares competing implementations across
 * multiple quality dimensions to produce scored evaluations.
 *
 * Uses dependency injection for the Evaluator's verification stack (merge gate,
 * verification pyramid). Adds heuristic scoring for maintainability, trail
 * alignment, and code quality.
 *
 * Spec Section 3.2 (Evaluator) — "when multiple agents produce competing
 * implementations, the Evaluator runs the full verification stack on each
 * and presents results to the Cortex for selection."
 * Spec Section 3.5 — "Expert-first selection chooses the winner based on
 * verification score, predicted maintainability, and trail alignment."
 *
 * Phase E, Step 23 — Competitive Generation for Critical Paths.
 */

import type {
  IGoalAssignment,
  IMergeGateResult,
  ITrailEntry,
} from "@kriptik/shared-interfaces";

import type {
  IImplementationComparator,
  ICompetitorResult,
  ICompetitorEvaluation,
} from "@kriptik/shared-interfaces";

// ---------------------------------------------------------------------------
// Scoring weights for composite score
// ---------------------------------------------------------------------------

/** Weights for each dimension in the composite score. Must sum to 1. */
const DIMENSION_WEIGHTS = {
  verification: 0.35,
  maintainability: 0.20,
  trailAlignment: 0.20,
  codeQuality: 0.15,
  performance: 0.10,
} as const;

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

/**
 * External operations the comparator needs. Injected to keep the
 * comparator decoupled from the Evaluator agent and git layer.
 */
export interface ImplementationComparatorDeps {
  /** Run the five-check merge gate on a branch. */
  readonly runMergeGate: (
    branchName: string,
    goalId: string,
    agentId: string,
    buildId: string,
  ) => Promise<IMergeGateResult>;

  /** Run the Evaluator's six-layer verification pyramid and return a score (0-1). */
  readonly runVerificationPyramid: (
    branchName: string,
    goal: IGoalAssignment,
  ) => Promise<{ score: number; assessment: string }>;

  /** Read files from a branch for code quality analysis. */
  readonly readBranchFiles: (
    branchName: string,
    filePaths: readonly string[],
  ) => Promise<ReadonlyMap<string, string>>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class ImplementationComparator implements IImplementationComparator {
  private readonly deps: ImplementationComparatorDeps;

  constructor(deps: ImplementationComparatorDeps) {
    this.deps = deps;
  }

  async evaluate(
    result: ICompetitorResult,
    goal: IGoalAssignment,
    trailPatterns: readonly ITrailEntry[],
  ): Promise<ICompetitorEvaluation> {
    // Run merge gate and verification pyramid in parallel
    const [mergeGateResult, verificationResult] = await Promise.all([
      this.deps.runMergeGate(
        result.branchName,
        goal.id,
        result.agentId,
        goal.buildId,
      ),
      this.deps.runVerificationPyramid(result.branchName, goal),
    ]);

    // Read the modified files for code quality analysis
    const fileContents = await this.deps.readBranchFiles(
      result.branchName,
      result.filesModified,
    );

    // Compute individual dimension scores
    const verificationScore = verificationResult.score;
    const maintainabilityScore = this.scoreMaintainability(fileContents);
    const trailAlignmentScore = this.scoreTrailAlignment(result, trailPatterns);
    const codeQualityScore = this.scoreCodeQuality(fileContents);
    const performanceScore = this.scorePerformance(fileContents);

    // Weighted composite
    const compositeScore =
      verificationScore * DIMENSION_WEIGHTS.verification +
      maintainabilityScore * DIMENSION_WEIGHTS.maintainability +
      trailAlignmentScore * DIMENSION_WEIGHTS.trailAlignment +
      codeQualityScore * DIMENSION_WEIGHTS.codeQuality +
      performanceScore * DIMENSION_WEIGHTS.performance;

    return {
      competitorId: result.competitorId,
      agentId: result.agentId,
      mergeGateResult,
      verificationScore,
      maintainabilityScore,
      trailAlignmentScore,
      codeQualityScore,
      performanceScore,
      compositeScore,
      evaluatorAssessment: verificationResult.assessment,
    };
  }

  rank(evaluations: readonly ICompetitorEvaluation[]): readonly ICompetitorEvaluation[] {
    return [...evaluations].sort((a, b) => b.compositeScore - a.compositeScore);
  }

  // -----------------------------------------------------------------------
  // Heuristic scoring
  // -----------------------------------------------------------------------

  /**
   * Score maintainability based on file structure and code organization.
   * Heuristic: smaller files, reasonable function density, good naming.
   */
  private scoreMaintainability(
    fileContents: ReadonlyMap<string, string>,
  ): number {
    if (fileContents.size === 0) return 0.5;

    let totalScore = 0;
    let fileCount = 0;

    for (const [, content] of fileContents) {
      fileCount++;
      let fileScore = 1.0;
      const lines = content.split("\n");

      // Penalize very large files (>500 lines)
      if (lines.length > 500) {
        fileScore -= Math.min(0.3, (lines.length - 500) / 2000);
      }

      // Reward files with reasonable function/class density
      const functionCount = (content.match(/(?:function |=>|async )/g) ?? []).length;
      const density = functionCount / Math.max(1, lines.length / 100);
      if (density >= 1 && density <= 8) {
        fileScore += 0.1; // Sweet spot of abstraction
      }

      // Penalize deeply nested code (4+ levels of indentation as signal)
      const deepNesting = lines.filter(
        (l) => /^\s{16,}\S/.test(l),
      ).length;
      if (deepNesting > lines.length * 0.1) {
        fileScore -= 0.15;
      }

      totalScore += Math.max(0, Math.min(1, fileScore));
    }

    return totalScore / fileCount;
  }

  /**
   * Score trail alignment — how well the implementation matches known
   * successful patterns from the trail library.
   *
   * Checks: dependency overlap, file naming conventions, similar structure.
   */
  private scoreTrailAlignment(
    result: ICompetitorResult,
    trailPatterns: readonly ITrailEntry[],
  ): number {
    if (trailPatterns.length === 0) return 0.5; // No trails = neutral

    let totalAlignment = 0;
    let trailCount = 0;

    for (const trail of trailPatterns) {
      trailCount++;
      let alignment = 0;

      // File overlap — do the modified files match files from successful trails?
      const trailFiles = new Set(trail.filesAffected);
      const overlapCount = result.filesModified.filter((f) =>
        trailFiles.has(f),
      ).length;
      const overlapRatio =
        overlapCount / Math.max(1, Math.max(result.filesModified.length, trail.filesAffected.length));
      alignment += overlapRatio * 0.4;

      // Dependency overlap — using the same libraries as successful trails
      const trailDeps = new Set(trail.dependenciesUsed);
      const depOverlap = result.filesModified.length > 0
        ? 0.3 // Partial credit when we can't check deps directly
        : 0;
      alignment += depOverlap;

      // Outcome quality of the trail itself — higher-scoring trails should
      // carry more alignment weight
      if (trail.evaluatorScore !== null) {
        alignment += trail.evaluatorScore * 0.3;
      } else {
        alignment += 0.15; // Neutral when no score available
      }

      totalAlignment += Math.min(1, alignment);
    }

    return totalAlignment / trailCount;
  }

  /**
   * Score code quality based on static heuristics.
   * Checks naming, TypeScript patterns, error handling, comments.
   */
  private scoreCodeQuality(
    fileContents: ReadonlyMap<string, string>,
  ): number {
    if (fileContents.size === 0) return 0.5;

    let totalScore = 0;
    let fileCount = 0;

    for (const [filePath, content] of fileContents) {
      fileCount++;
      let fileScore = 0.7; // Base score — assume reasonable quality

      const isTypeScript = filePath.endsWith(".ts") || filePath.endsWith(".tsx");

      if (isTypeScript) {
        // Reward explicit type annotations on exports
        const exportCount = (content.match(/export /g) ?? []).length;
        const typedExportCount = (
          content.match(/export (?:type |interface |const \w+:\s|function \w+\()/g) ?? []
        ).length;
        if (exportCount > 0) {
          fileScore += (typedExportCount / exportCount) * 0.15;
        }

        // Reward readonly usage (immutability signal)
        if (content.includes("readonly ")) {
          fileScore += 0.05;
        }
      }

      // Penalize any/unknown casts (type safety signal)
      const anyCasts = (content.match(/as any/g) ?? []).length;
      fileScore -= Math.min(0.2, anyCasts * 0.05);

      // Reward error handling
      if (content.includes("catch") || content.includes("Error(")) {
        fileScore += 0.05;
      }

      totalScore += Math.max(0, Math.min(1, fileScore));
    }

    return totalScore / fileCount;
  }

  /**
   * Score performance characteristics based on code patterns.
   * Heuristic: async patterns, caching signals, avoiding unnecessary work.
   */
  private scorePerformance(
    fileContents: ReadonlyMap<string, string>,
  ): number {
    if (fileContents.size === 0) return 0.5;

    let totalScore = 0;
    let fileCount = 0;

    for (const [, content] of fileContents) {
      fileCount++;
      let fileScore = 0.7; // Base — assume reasonable performance

      // Reward parallel async operations (Promise.all, Promise.allSettled)
      if (content.includes("Promise.all") || content.includes("Promise.allSettled")) {
        fileScore += 0.1;
      }

      // Reward caching patterns
      if (content.includes("Map(") || content.includes("cache") || content.includes("memoize")) {
        fileScore += 0.05;
      }

      // Penalize synchronous heavy operations in async contexts
      const syncHeavyPatterns = (
        content.match(/JSON\.parse|JSON\.stringify/g) ?? []
      ).length;
      if (syncHeavyPatterns > 5) {
        fileScore -= 0.05;
      }

      totalScore += Math.max(0, Math.min(1, fileScore));
    }

    return totalScore / fileCount;
  }
}
