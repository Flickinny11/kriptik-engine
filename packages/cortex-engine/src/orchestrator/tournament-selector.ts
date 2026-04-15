/**
 * TournamentSelector — selects the winning implementation from competing
 * agents and captures losing implementations as "alternative" trail entries.
 *
 * Expert-first selection: the highest-scoring implementation wins. Losing
 * implementations are preserved as alternative trails — valuable fallback
 * knowledge if the winning approach encounters issues later.
 *
 * Spec Section 3.5 — "Expert-first selection chooses the winner based on
 * verification score, predicted maintainability, and trail alignment."
 * Spec Section 6.3 — "Alternative trails — losing implementations from
 * competitive generation. Valuable as fallback knowledge."
 *
 * Phase E, Step 23 — Competitive Generation for Critical Paths.
 */

import type {
  ITrailEntry,
  TrailOutcome,
} from "@kriptik/shared-interfaces";

import type {
  ITournamentSelector,
  ICompetitorEvaluation,
  ICompetitorResult,
  ICompetitionOutcome,
} from "@kriptik/shared-interfaces";

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class TournamentSelector implements ITournamentSelector {
  select(
    goalId: string,
    rankedEvaluations: readonly ICompetitorEvaluation[],
    competitorResults: readonly ICompetitorResult[],
    buildId: string,
    taskType: string,
  ): ICompetitionOutcome {
    if (rankedEvaluations.length === 0) {
      throw new Error(
        `TournamentSelector: no evaluations to select from for goal ${goalId}`,
      );
    }

    const now = new Date();
    const winner = rankedEvaluations[0];
    const losers = rankedEvaluations.slice(1);

    // Build a lookup for competitor results
    const resultsByCompetitor = new Map<string, ICompetitorResult>();
    for (const result of competitorResults) {
      resultsByCompetitor.set(result.competitorId, result);
    }

    const winnerResult = resultsByCompetitor.get(winner.competitorId);
    if (!winnerResult) {
      throw new Error(
        `TournamentSelector: no result found for winner ${winner.competitorId}`,
      );
    }

    // Create alternative trail entries for each losing implementation
    const alternativeTrails: ITrailEntry[] = [];
    for (const loser of losers) {
      const loserResult = resultsByCompetitor.get(loser.competitorId);
      if (!loserResult || !loserResult.completedSuccessfully) {
        continue; // Skip failed competitors — they don't produce useful alternatives
      }

      const trail = this.createAlternativeTrail(
        loser,
        loserResult,
        winner,
        buildId,
        taskType,
        goalId,
        now,
      );
      alternativeTrails.push(trail);
    }

    // Compute total token cost from all competitors
    // (actual token tracking happens in agent sessions — here we record the
    //  fact that we consumed resources for N parallel agents)
    const totalTokenCost = this.estimateTokenCost(competitorResults);

    // Determine eliminated branches (all branches except the winner's)
    const eliminatedBranches = competitorResults
      .filter((r) => r.competitorId !== winner.competitorId)
      .map((r) => r.branchName);

    // Find the earliest start time across all competitors
    const startedAt = competitorResults.reduce(
      (earliest, r) => (r.startedAt < earliest ? r.startedAt : earliest),
      competitorResults[0].startedAt,
    );

    return {
      goalId,
      winner,
      rankedEvaluations,
      alternativeTrails,
      winningBranch: winnerResult.branchName,
      eliminatedBranches,
      totalTokenCost,
      startedAt,
      completedAt: now,
    };
  }

  // -----------------------------------------------------------------------
  // Alternative trail creation
  // -----------------------------------------------------------------------

  /**
   * Create an alternative trail entry from a losing implementation.
   *
   * Spec Section 6.3 — "Alternative trails — losing implementations from
   * competitive generation. Valuable as fallback knowledge: 'If the winning
   * approach has issues, approach B was also fully implemented and scored 87%.'"
   */
  private createAlternativeTrail(
    loser: ICompetitorEvaluation,
    loserResult: ICompetitorResult,
    winner: ICompetitorEvaluation,
    buildId: string,
    taskType: string,
    goalId: string,
    now: Date,
  ): ITrailEntry {
    const scorePercent = Math.round(loser.compositeScore * 100);
    const winnerScorePercent = Math.round(winner.compositeScore * 100);
    const scoreDelta = winnerScorePercent - scorePercent;

    // Determine outcome based on whether the implementation passed merge gate
    const outcome: TrailOutcome = loser.mergeGateResult.passed
      ? "passed_first_pass"
      : "passed_after_fix";

    return {
      id: `alt-${buildId}-${goalId}-${loser.competitorId}`,
      trailType: "alternative",
      taskType,
      decision: `Alternative implementation for goal "${goalId}" ` +
        `(competitor ${loser.competitorId}). ` +
        `Scored ${scorePercent}% composite, ${scoreDelta}% below winner.`,
      reasoning: loser.evaluatorAssessment,
      outcome,
      evaluatorScore: loser.compositeScore,
      filesAffected: loserResult.filesModified as string[],
      dependenciesUsed: [],
      gotchasEncountered: this.extractGotchas(loser, winner),
      resolution: `Winner (competitor ${winner.competitorId}) selected with ` +
        `${winnerScorePercent}% composite score. This alternative preserved ` +
        `as fallback knowledge.`,
      buildId,
      agentId: loser.agentId,
      recordedAt: now,
      lastValidatedAt: now,
    };
  }

  /**
   * Extract gotchas from the comparison between a loser and the winner.
   * These are the dimensions where the loser underperformed.
   */
  private extractGotchas(
    loser: ICompetitorEvaluation,
    winner: ICompetitorEvaluation,
  ): readonly string[] {
    const gotchas: string[] = [];

    if (loser.verificationScore < winner.verificationScore) {
      gotchas.push(
        `Lower verification score: ${(loser.verificationScore * 100).toFixed(0)}% ` +
        `vs winner's ${(winner.verificationScore * 100).toFixed(0)}%`,
      );
    }

    if (loser.maintainabilityScore < winner.maintainabilityScore) {
      gotchas.push(
        `Lower maintainability: ${(loser.maintainabilityScore * 100).toFixed(0)}% ` +
        `vs winner's ${(winner.maintainabilityScore * 100).toFixed(0)}%`,
      );
    }

    if (loser.trailAlignmentScore < winner.trailAlignmentScore) {
      gotchas.push(
        `Lower trail alignment: ${(loser.trailAlignmentScore * 100).toFixed(0)}% ` +
        `vs winner's ${(winner.trailAlignmentScore * 100).toFixed(0)}%`,
      );
    }

    if (!loser.mergeGateResult.passed) {
      const failedChecks = loser.mergeGateResult.checks
        .filter((c) => !c.passed)
        .map((c) => c.check);
      gotchas.push(
        `Failed merge gate checks: ${failedChecks.join(", ")}`,
      );
    }

    return gotchas;
  }

  // -----------------------------------------------------------------------
  // Token cost estimation
  // -----------------------------------------------------------------------

  /**
   * Estimate total token cost from all competitor sessions.
   * In practice, actual token counts come from the agent harness's
   * ITokenUsage — here we aggregate what we know from result metadata.
   */
  private estimateTokenCost(
    results: readonly ICompetitorResult[],
  ): { inputTokens: number; outputTokens: number } {
    // Token cost estimation based on competitor activity.
    // Actual tracking happens in the agent sessions via ITokenUsage.
    // Here we provide a rough estimate: ~50k input + 20k output per
    // completed competitor (based on typical Opus 4.6 build agent usage).
    const completedCount = results.filter(
      (r) => r.completedSuccessfully,
    ).length;
    const failedCount = results.filter(
      (r) => !r.completedSuccessfully,
    ).length;

    return {
      inputTokens: completedCount * 50_000 + failedCount * 20_000,
      outputTokens: completedCount * 20_000 + failedCount * 8_000,
    };
  }
}
