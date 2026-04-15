/**
 * Trail ranker — ranks retrieved trails by relevance to the current goal.
 *
 * Implements the six-factor ranking algorithm from spec Section 6.3:
 * 1. Task type match — exact match ranks highest
 * 2. Tech stack match — same framework/library versions rank higher
 * 3. Outcome quality — higher evaluator scores rank higher
 * 4. Recency — more recent trails rank higher (APIs evolve)
 * 5. Violation weight — violation trails get a ranking boost
 * 6. Trail freshness — recently validated trails rank higher
 *
 * Each factor produces a score between 0 and 1. The composite score is
 * a weighted sum of all factors.
 *
 * Spec Section 6.3 — "Trail Ranking and Injection."
 */

import type {
  ITrailRanker,
  ITrailEntry,
  ITrailRankingCriteria,
  IRankedTrail,
} from "@kriptik/shared-interfaces";

/** Weights for each ranking factor. Sum to 1.0. */
const FACTOR_WEIGHTS = {
  taskTypeMatch: 0.30,
  techStackMatch: 0.20,
  outcomeQuality: 0.15,
  recency: 0.15,
  violationBoost: 0.10,
  freshness: 0.10,
} as const;

/** Recency half-life in days — trails older than this get 50% recency score. */
const RECENCY_HALF_LIFE_DAYS = 30;

/** Freshness half-life in days for lastValidatedAt. */
const FRESHNESS_HALF_LIFE_DAYS = 60;

/**
 * Ranks trails using the six-factor algorithm.
 *
 * The ranker is deterministic and does not require LLM calls — it's
 * a mathematical scoring function applied to structured trail data.
 */
export class TrailRanker implements ITrailRanker {
  rank(
    trails: readonly ITrailEntry[],
    criteria: ITrailRankingCriteria,
  ): readonly IRankedTrail[] {
    const now = new Date();

    const ranked: IRankedTrail[] = trails.map((trail) => {
      const factors = {
        taskTypeMatch: scoreTaskTypeMatch(trail.taskType, criteria.taskType),
        techStackMatch: scoreTechStackMatch(
          trail.dependenciesUsed,
          criteria.techStack,
        ),
        outcomeQuality: scoreOutcomeQuality(trail),
        recency: scoreRecency(trail.recordedAt, now),
        violationBoost: scoreViolationBoost(
          trail,
          criteria.boostViolations,
        ),
        freshness: scoreFreshness(trail.lastValidatedAt, now),
      };

      const score =
        factors.taskTypeMatch * FACTOR_WEIGHTS.taskTypeMatch +
        factors.techStackMatch * FACTOR_WEIGHTS.techStackMatch +
        factors.outcomeQuality * FACTOR_WEIGHTS.outcomeQuality +
        factors.recency * FACTOR_WEIGHTS.recency +
        factors.violationBoost * FACTOR_WEIGHTS.violationBoost +
        factors.freshness * FACTOR_WEIGHTS.freshness;

      return { trail, score, factors };
    });

    ranked.sort((a, b) => b.score - a.score);
    return ranked.slice(0, criteria.maxTrails);
  }
}

/**
 * Factor 1: Task type match.
 *
 * Exact match = 1.0, partial match (shared prefix segments) = 0.3-0.7,
 * no match = 0.0.
 *
 * Task types use underscore-separated segments (e.g., "stripe_billing_next_app_router").
 * Partial matches reward shared domain context.
 */
function scoreTaskTypeMatch(trailTaskType: string, queryTaskType: string): number {
  if (trailTaskType === queryTaskType) return 1.0;

  const trailParts = trailTaskType.split("_");
  const queryParts = queryTaskType.split("_");

  let matchingParts = 0;
  const maxParts = Math.max(trailParts.length, queryParts.length);

  for (let i = 0; i < Math.min(trailParts.length, queryParts.length); i++) {
    if (trailParts[i] === queryParts[i]) {
      matchingParts++;
    }
  }

  if (matchingParts === 0) return 0.0;
  return 0.3 + 0.4 * (matchingParts / maxParts);
}

/**
 * Factor 2: Tech stack match.
 *
 * Fraction of the query's tech stack that appears in the trail's dependencies.
 * Matches on package name (ignoring version for partial credit).
 */
function scoreTechStackMatch(
  trailDeps: readonly string[],
  queryStack: readonly string[],
): number {
  if (queryStack.length === 0) return 0.5; // Neutral when no stack specified

  const trailPackages = new Set(
    trailDeps.map((d) => extractPackageName(d)),
  );

  let matches = 0;
  for (const dep of queryStack) {
    if (trailPackages.has(extractPackageName(dep))) {
      matches++;
    }
  }

  return matches / queryStack.length;
}

/**
 * Factor 3: Outcome quality.
 *
 * Combines the outcome category with the evaluator score.
 * passed_first_pass = base 0.9, passed_after_fix = 0.7,
 * required_rotation = 0.4, required_firing = 0.2 (but boosted by violation weight),
 * abandoned = 0.1 (dead-ends are still valuable context).
 */
function scoreOutcomeQuality(trail: ITrailEntry): number {
  let base: number;
  switch (trail.outcome) {
    case "passed_first_pass":
      base = 0.9;
      break;
    case "passed_after_fix":
      base = 0.7;
      break;
    case "required_rotation":
      base = 0.4;
      break;
    case "required_firing":
      base = 0.2;
      break;
    case "abandoned":
      base = 0.1;
      break;
  }

  // Blend with evaluator score if available (70% base, 30% evaluator)
  if (trail.evaluatorScore !== null) {
    return base * 0.7 + trail.evaluatorScore * 0.3;
  }

  return base;
}

/**
 * Factor 4: Recency.
 *
 * Exponential decay with configurable half-life.
 * score = 2^(-daysSinceRecorded / halfLifeDays)
 */
function scoreRecency(recordedAt: Date, now: Date): number {
  const daysSince =
    (now.getTime() - recordedAt.getTime()) / (1000 * 60 * 60 * 24);
  return Math.pow(2, -daysSince / RECENCY_HALF_LIFE_DAYS);
}

/**
 * Factor 5: Violation boost.
 *
 * Violation trails get a full boost (1.0) when boostViolations is enabled.
 * Non-violation trails get 0.0 for this factor (neutral contribution).
 *
 * Spec Section 6.3 — "Violation trails get a ranking boost for task types
 * where violations have occurred."
 */
function scoreViolationBoost(
  trail: ITrailEntry,
  boostEnabled: boolean,
): number {
  if (!boostEnabled) return 0.5; // Neutral when boosting disabled
  return trail.trailType === "violation" ? 1.0 : 0.0;
}

/**
 * Factor 6: Trail freshness.
 *
 * Based on lastValidatedAt — how recently was this trail confirmed
 * working in a real build?
 *
 * Spec Section 3.2 — "tracks trail freshness."
 */
function scoreFreshness(lastValidatedAt: Date | null, now: Date): number {
  if (!lastValidatedAt) return 0.3; // Unvalidated trails get a low baseline

  const daysSince =
    (now.getTime() - lastValidatedAt.getTime()) / (1000 * 60 * 60 * 24);
  return Math.pow(2, -daysSince / FRESHNESS_HALF_LIFE_DAYS);
}

/**
 * Extract package name from a dependency string.
 * "stripe@14.2.1" → "stripe"
 * "@anthropic-ai/sdk@0.39.0" → "@anthropic-ai/sdk"
 */
function extractPackageName(dep: string): string {
  // Handle scoped packages (@scope/name@version)
  if (dep.startsWith("@")) {
    const withoutScope = dep.substring(1);
    const slashIdx = withoutScope.indexOf("/");
    if (slashIdx === -1) return dep;
    const afterSlash = withoutScope.substring(slashIdx + 1);
    const atIdx = afterSlash.indexOf("@");
    if (atIdx === -1) return dep;
    return dep.substring(0, slashIdx + 2 + atIdx);
  }

  // Unscoped packages (name@version)
  const atIdx = dep.indexOf("@");
  if (atIdx === -1) return dep;
  return dep.substring(0, atIdx);
}
