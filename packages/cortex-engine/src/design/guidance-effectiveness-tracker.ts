/**
 * GuidanceEffectivenessTracker — tracks which ephemeral guidance rules
 * agents follow vs. ignore, enabling data-driven refinement.
 *
 * The tracker records compliance observations after each nudge injection
 * and computes aggregate metrics per rule. These metrics feed:
 * 1. The Ephemeral Guidance Engine — for rule priority adjustment and retirement
 * 2. The Operating Context Evolver — for instruction compliance tracking
 *
 * Spec Section 7.3, Layer 3 — continuous learning pipeline.
 * Spec Section 6.5 — compliance tracking for self-modifying instructions.
 */

import type {
  IGuidanceEffectivenessObservation,
  IGuidanceRuleMetrics,
  IGuidanceEffectivenessTracker,
} from "@kriptik/shared-interfaces";

// ---------------------------------------------------------------------------
// Internal per-rule accumulator
// ---------------------------------------------------------------------------

interface RuleAccumulator {
  ruleId: string;
  observations: IGuidanceEffectivenessObservation[];
  buildsActive: Set<string>;
  lastTriggeredAt: Date | null;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class GuidanceEffectivenessTracker
  implements IGuidanceEffectivenessTracker
{
  private accumulators: Map<string, RuleAccumulator> = new Map();

  recordObservation(observation: IGuidanceEffectivenessObservation): void {
    let acc = this.accumulators.get(observation.ruleId);
    if (!acc) {
      acc = {
        ruleId: observation.ruleId,
        observations: [],
        buildsActive: new Set(),
        lastTriggeredAt: null,
      };
      this.accumulators.set(observation.ruleId, acc);
    }

    acc.observations.push(observation);
    acc.buildsActive.add(observation.buildId);
    acc.lastTriggeredAt = observation.observedAt;
  }

  getRuleMetrics(ruleId: string): IGuidanceRuleMetrics | null {
    const acc = this.accumulators.get(ruleId);
    if (!acc) return null;
    return this.computeMetrics(acc);
  }

  getAllMetrics(): readonly IGuidanceRuleMetrics[] {
    return Array.from(this.accumulators.values())
      .map((acc) => this.computeMetrics(acc))
      .sort((a, b) => b.impactScore - a.impactScore);
  }

  getRetirementCandidates(
    minTriggers: number = 10,
    maxComplianceRate: number = 0.2,
  ): readonly IGuidanceRuleMetrics[] {
    return this.getAllMetrics().filter(
      (m) =>
        m.totalTriggers >= minTriggers &&
        m.complianceRate <= maxComplianceRate &&
        m.impactScore < 0.15,
    );
  }

  getBoostCandidates(): readonly IGuidanceRuleMetrics[] {
    return this.getAllMetrics().filter(
      (m) =>
        m.totalTriggers >= 5 &&
        m.complianceRate > 0.7 &&
        m.impactScore > 0.6,
    );
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private computeMetrics(acc: RuleAccumulator): IGuidanceRuleMetrics {
    const obs = acc.observations;
    const total = obs.length;

    const complied = obs.filter((o) => o.outcome === "complied").length;
    const ignored = obs.filter((o) => o.outcome === "ignored").length;
    const partial = obs.filter((o) => o.outcome === "partial").length;

    // Only count deterministic outcomes for compliance rate
    const deterministic = complied + ignored + partial;
    const complianceRate =
      deterministic > 0 ? complied / deterministic : 0;

    // Impact score combines compliance rate with how often the rule fires.
    // A high-compliance rule that fires often has more impact than one
    // that fires rarely. We also penalize rules with high ignore rates.
    const firingFrequency = Math.min(total / 50, 1.0); // saturates at 50
    const ignoreRatio = deterministic > 0 ? ignored / deterministic : 0;
    const impactScore = Math.max(
      0,
      complianceRate * 0.6 + firingFrequency * 0.2 + (1 - ignoreRatio) * 0.2,
    );

    return {
      ruleId: acc.ruleId,
      totalTriggers: total,
      compliedCount: complied,
      ignoredCount: ignored,
      partialCount: partial,
      complianceRate,
      impactScore: Math.round(impactScore * 100) / 100,
      lastTriggeredAt: acc.lastTriggeredAt,
      buildsActive: acc.buildsActive.size,
    };
  }
}
