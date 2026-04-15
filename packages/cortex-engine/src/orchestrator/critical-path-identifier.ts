/**
 * CriticalPathIdentifier — determines which goals warrant the cost of
 * competitive generation based on downstream impact, novelty, and risk.
 *
 * Fork criteria (Spec Section 3.5):
 *   - Critical path: goal is on the dependency graph's longest chain
 *   - High error consequence: many downstream goals depend on this one
 *   - Conflicting trails: trail library has divergent high-quality patterns
 *   - High downstream deps: lots of goals blocked by this one
 *
 * Suppression rules (Spec Section 3.5):
 *   - Convergent trails: >90% success rate — no ambiguity
 *   - Leaf tasks: no downstream dependents
 *   - Boilerplate: well-understood, low-risk
 *   - Cost-constrained: build budget doesn't allow extra agent sessions
 *
 * Phase E, Step 23 — Competitive Generation for Critical Paths.
 */

import type {
  IGoalAssignment,
} from "@kriptik/shared-interfaces";

import type {
  ICriticalPathIdentifier,
  IForkAssessment,
  ForkCriterion,
  NoForkReason,
} from "@kriptik/shared-interfaces";

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** Minimum downstream dependents to trigger high-downstream-deps criterion. */
const HIGH_DOWNSTREAM_THRESHOLD = 3;

/** Minimum downstream dependents for high-error-consequence criterion. */
const HIGH_ERROR_CONSEQUENCE_THRESHOLD = 5;

/** Minimum conflicting trail patterns to trigger the criterion. */
const CONFLICTING_TRAILS_THRESHOLD = 2;

/** Trail success rate above which we suppress forking (convergent patterns). */
const CONVERGENT_TRAIL_RATE = 0.90;

/** Fork score above which we recommend 3 competitors instead of 2. */
const THREE_COMPETITOR_THRESHOLD = 0.70;

// ---------------------------------------------------------------------------
// Criterion weights for composite score
// ---------------------------------------------------------------------------

const CRITERION_WEIGHTS: Record<ForkCriterion, number> = {
  "critical-path": 0.35,
  "high-error-consequence": 0.25,
  "conflicting-trails": 0.25,
  "high-downstream-deps": 0.15,
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class CriticalPathIdentifier implements ICriticalPathIdentifier {
  assess(
    goal: IGoalAssignment,
    criticalPath: readonly string[],
    dependentCount: number,
    trailSuccessRate: number,
    conflictingTrailCount: number,
    isCostConstrained: boolean,
  ): IForkAssessment {
    // Step 1: Check suppression reasons first — these override all criteria
    const suppressionReasons = this.checkSuppressions(
      goal,
      dependentCount,
      trailSuccessRate,
      isCostConstrained,
    );

    if (suppressionReasons.length > 0) {
      return {
        goalId: goal.id,
        shouldFork: false,
        triggeredCriteria: [],
        suppressionReasons,
        forkScore: 0,
        recommendedCompetitorCount: 2,
      };
    }

    // Step 2: Evaluate fork criteria
    const triggeredCriteria = this.evaluateCriteria(
      goal,
      criticalPath,
      dependentCount,
      conflictingTrailCount,
    );

    // Step 3: Compute composite fork score
    const forkScore = this.computeForkScore(
      triggeredCriteria,
      dependentCount,
      conflictingTrailCount,
      trailSuccessRate,
    );

    // A goal should fork if at least one criterion triggered
    const shouldFork = triggeredCriteria.length > 0;

    // 3 competitors for high-urgency forks, 2 otherwise
    const recommendedCompetitorCount: 2 | 3 =
      forkScore >= THREE_COMPETITOR_THRESHOLD ? 3 : 2;

    return {
      goalId: goal.id,
      shouldFork,
      triggeredCriteria,
      suppressionReasons: [],
      forkScore,
      recommendedCompetitorCount,
    };
  }

  private checkSuppressions(
    goal: IGoalAssignment,
    dependentCount: number,
    trailSuccessRate: number,
    isCostConstrained: boolean,
  ): readonly NoForkReason[] {
    const reasons: NoForkReason[] = [];

    if (isCostConstrained) {
      reasons.push("cost-constrained");
    }

    if (dependentCount === 0) {
      reasons.push("leaf-task");
    }

    if (trailSuccessRate >= CONVERGENT_TRAIL_RATE) {
      reasons.push("convergent-trails");
    }

    // Boilerplate detection: goals with very short descriptions and no
    // interface contracts are likely well-understood mechanical tasks
    if (
      goal.description.length < 40 &&
      goal.interfaceContracts.length === 0 &&
      goal.dependsOn.length === 0
    ) {
      reasons.push("boilerplate");
    }

    return reasons;
  }

  private evaluateCriteria(
    goal: IGoalAssignment,
    criticalPath: readonly string[],
    dependentCount: number,
    conflictingTrailCount: number,
  ): readonly ForkCriterion[] {
    const criteria: ForkCriterion[] = [];

    if (criticalPath.includes(goal.id)) {
      criteria.push("critical-path");
    }

    if (dependentCount >= HIGH_ERROR_CONSEQUENCE_THRESHOLD) {
      criteria.push("high-error-consequence");
    }

    if (conflictingTrailCount >= CONFLICTING_TRAILS_THRESHOLD) {
      criteria.push("conflicting-trails");
    }

    if (dependentCount >= HIGH_DOWNSTREAM_THRESHOLD) {
      criteria.push("high-downstream-deps");
    }

    return criteria;
  }

  private computeForkScore(
    triggeredCriteria: readonly ForkCriterion[],
    dependentCount: number,
    conflictingTrailCount: number,
    trailSuccessRate: number,
  ): number {
    if (triggeredCriteria.length === 0) return 0;

    // Base score from triggered criterion weights
    let score = 0;
    for (const criterion of triggeredCriteria) {
      score += CRITERION_WEIGHTS[criterion];
    }

    // Modulate by trail ambiguity — low success rate and conflicting trails
    // increase urgency. Saturates at 1.3x boost.
    const ambiguityFactor = 1 + Math.min(0.3,
      (1 - trailSuccessRate) * 0.2 +
      Math.min(conflictingTrailCount / 10, 0.1),
    );
    score *= ambiguityFactor;

    // Modulate by downstream impact — more dependents increase urgency.
    // Saturates at 1.2x boost for 10+ dependents.
    const impactFactor = 1 + Math.min(0.2, dependentCount * 0.02);
    score *= impactFactor;

    return Math.min(1, score);
  }
}
