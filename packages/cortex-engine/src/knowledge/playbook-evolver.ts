/**
 * PlaybookEvolver — the Curator in ACE terminology.
 *
 * Merges, refines, and retires playbooks as evidence accumulates across
 * builds. Handles:
 * - Reinforcing playbooks with confirming evidence (success rate update)
 * - Refining playbooks with new gotchas, decisions, or constraints
 * - Merging overlapping playbooks for the same task type
 * - Promoting build-level to domain-level when evidence threshold met
 * - Deprecating stale playbooks that haven't been validated recently
 * - Retiring playbooks that have been superseded or are failing
 *
 * Spec Section 6.4 — "the knowledge base management logic organizes and
 * depreciates stale entries (Curator)"
 * Spec Section 3.2 — Librarian "tracks trail freshness" (applied to playbooks)
 */

import type {
  IPlaybook,
  IPlaybookEvolver,
  IPlaybookExtraction,
  IPlaybookEvolutionRecord,
  IPlaybookSnapshot,
  PlaybookEvolutionType,
} from "@kriptik/shared-interfaces";

/** Default minimum evidence count for domain promotion. */
const DEFAULT_MIN_EVIDENCE_FOR_PROMOTION = 5;

/** Default minimum success rate for domain promotion. */
const DEFAULT_MIN_SUCCESS_RATE_FOR_PROMOTION = 0.8;

/**
 * PlaybookEvolver — evolves, merges, and curates the playbook library.
 */
export class PlaybookEvolver implements IPlaybookEvolver {
  evolve(
    extraction: IPlaybookExtraction,
    allPlaybooks: readonly IPlaybook[],
  ): readonly IPlaybookEvolutionRecord[] {
    const records: IPlaybookEvolutionRecord[] = [];
    const now = new Date();

    // Process reinforcements — update success rate and evidence count
    for (const playbookId of extraction.reinforcedPlaybookIds) {
      const playbook = allPlaybooks.find((pb) => pb.id === playbookId);
      if (!playbook) continue;

      const before = takeSnapshot(playbook);
      const updatedEvidence = playbook.evidenceCount + 1;

      // Weighted average: existing metrics weighted by prior evidence,
      // new build contributes 1 evidence unit
      const after: IPlaybookSnapshot = {
        approach: playbook.approach,
        constraints: playbook.constraints,
        successRate: playbook.successRate, // Reinforcement means it worked
        evidenceCount: updatedEvidence,
        status: playbook.status,
      };

      records.push(
        createEvolutionRecord(
          playbookId,
          "reinforced",
          `Reinforced by build ${extraction.buildId} — approach confirmed successful`,
          extraction.buildId,
          [],
          before,
          after,
          now,
        ),
      );
    }

    // Process refinements — new gotchas, decisions, or constraints
    for (const playbookId of extraction.refinedPlaybookIds) {
      const playbook = allPlaybooks.find((pb) => pb.id === playbookId);
      if (!playbook) continue;

      const before = takeSnapshot(playbook);
      const after: IPlaybookSnapshot = {
        approach: playbook.approach,
        constraints: playbook.constraints,
        successRate: playbook.successRate,
        evidenceCount: playbook.evidenceCount + 1,
        status: playbook.status,
      };

      records.push(
        createEvolutionRecord(
          playbookId,
          "refined",
          `Refined by build ${extraction.buildId} — new evidence added`,
          extraction.buildId,
          [],
          before,
          after,
          now,
        ),
      );
    }

    // Process new playbooks — record creation events
    for (const newPlaybook of extraction.newPlaybooks) {
      // New playbooks don't have IDs yet (they'll be assigned by the store),
      // so we use a placeholder that will be updated by the caller
      const after: IPlaybookSnapshot = {
        approach: newPlaybook.approach,
        constraints: newPlaybook.constraints,
        successRate: newPlaybook.successRate,
        evidenceCount: newPlaybook.evidenceCount,
        status: newPlaybook.status,
      };

      records.push(
        createEvolutionRecord(
          "", // Placeholder — caller updates after store.insert()
          "created",
          `Created from build ${extraction.buildId} for task type: ${newPlaybook.taskType}`,
          extraction.buildId,
          newPlaybook.sourceTrailIds as string[],
          null,
          after,
          now,
        ),
      );
    }

    return records;
  }

  merge(
    playbookA: IPlaybook,
    playbookB: IPlaybook,
  ): { merged: IPlaybook; evolution: IPlaybookEvolutionRecord } {
    const now = new Date();

    // Use the playbook with higher success rate as the base approach
    const primary =
      playbookA.successRate >= playbookB.successRate ? playbookA : playbookB;
    const secondary = primary === playbookA ? playbookB : playbookA;

    // Merge approach: primary's approach supplemented by secondary's unique decisions
    const mergedApproach = primary.approach;

    // Combine constraints (deduplicate)
    const constraintSet = new Set<string>([
      ...primary.constraints,
      ...secondary.constraints,
    ]);

    // Combine key decisions (deduplicate by decision text, sum confirmations)
    const decisionMap = new Map<
      string,
      { reasoning: string; confirmations: number }
    >();
    for (const d of [...primary.keyDecisions, ...secondary.keyDecisions]) {
      const existing = decisionMap.get(d.decision);
      if (existing) {
        existing.confirmations += d.confirmations;
      } else {
        decisionMap.set(d.decision, {
          reasoning: d.reasoning,
          confirmations: d.confirmations,
        });
      }
    }

    // Combine gotchas (deduplicate by situation, sum occurrences)
    const gotchaMap = new Map<
      string,
      { resolution: string; occurrences: number }
    >();
    for (const g of [...primary.gotchas, ...secondary.gotchas]) {
      const existing = gotchaMap.get(g.situation);
      if (existing) {
        existing.occurrences += g.occurrences;
      } else {
        gotchaMap.set(g.situation, {
          resolution: g.resolution,
          occurrences: g.occurrences,
        });
      }
    }

    // Combine dependencies
    const depSet = new Set<string>([
      ...primary.validatedDependencies,
      ...secondary.validatedDependencies,
    ]);

    // Weighted average for metrics
    const totalEvidence = primary.evidenceCount + secondary.evidenceCount;
    const weightedSuccessRate =
      (primary.successRate * primary.evidenceCount +
        secondary.successRate * secondary.evidenceCount) /
      totalEvidence;
    const weightedEvalScore =
      (primary.averageEvaluatorScore * primary.evidenceCount +
        secondary.averageEvaluatorScore * secondary.evidenceCount) /
      totalEvidence;

    // Combine source trails
    const sourceTrailSet = new Set<string>([
      ...primary.sourceTrailIds,
      ...secondary.sourceTrailIds,
    ]);

    const merged: Omit<IPlaybook, "id"> = {
      taskType: primary.taskType,
      level: primary.level,
      status: "active",
      approach: mergedApproach,
      constraints: Array.from(constraintSet),
      keyDecisions: Array.from(decisionMap.entries()).map(
        ([decision, { reasoning, confirmations }]) => ({
          decision,
          reasoning,
          confirmations,
        }),
      ),
      gotchas: Array.from(gotchaMap.entries()).map(
        ([situation, { resolution, occurrences }]) => ({
          situation,
          resolution,
          occurrences,
        }),
      ),
      validatedDependencies: Array.from(depSet),
      evidenceCount: totalEvidence,
      successRate: weightedSuccessRate,
      averageEvaluatorScore: weightedEvalScore,
      sourceTrailIds: Array.from(sourceTrailSet),
      mergedFromIds: [playbookA.id, playbookB.id],
      mergedIntoId: null,
      createdAt: now,
      updatedAt: now,
      lastValidatedAt:
        newerDate(primary.lastValidatedAt, secondary.lastValidatedAt),
    };

    const after: IPlaybookSnapshot = {
      approach: merged.approach,
      constraints: merged.constraints,
      successRate: merged.successRate,
      evidenceCount: merged.evidenceCount,
      status: "active",
    };

    const evolution = createEvolutionRecord(
      "", // Placeholder — caller updates after store.insert()
      "merged",
      `Merged playbooks ${playbookA.id} and ${playbookB.id} for task type: ${primary.taskType}`,
      null,
      [],
      null,
      after,
      now,
    );

    return { merged: merged as IPlaybook, evolution };
  }

  sweepStale(
    playbooks: readonly IPlaybook[],
    stalenessThresholdMs: number,
  ): readonly IPlaybookEvolutionRecord[] {
    const records: IPlaybookEvolutionRecord[] = [];
    const now = new Date();
    const cutoff = new Date(now.getTime() - stalenessThresholdMs);

    for (const playbook of playbooks) {
      if (playbook.status !== "active") continue;

      const lastValidated = playbook.lastValidatedAt;
      if (lastValidated === null || lastValidated < cutoff) {
        const before = takeSnapshot(playbook);
        const after: IPlaybookSnapshot = {
          ...before,
          status: "deprecated",
        };

        records.push(
          createEvolutionRecord(
            playbook.id,
            "deprecated",
            `Deprecated — not validated since ${lastValidated?.toISOString() ?? "creation"}. Staleness threshold: ${Math.round(stalenessThresholdMs / (1000 * 60 * 60 * 24))} days.`,
            null,
            [],
            before,
            after,
            now,
          ),
        );
      }
    }

    return records;
  }

  evaluatePromotion(
    playbook: IPlaybook,
    minEvidence: number = DEFAULT_MIN_EVIDENCE_FOR_PROMOTION,
    minSuccessRate: number = DEFAULT_MIN_SUCCESS_RATE_FOR_PROMOTION,
  ): IPlaybookEvolutionRecord | null {
    // Only build-level playbooks can be promoted to domain-level
    if (playbook.level !== "build") return null;

    // Check thresholds
    if (playbook.evidenceCount < minEvidence) return null;
    if (playbook.successRate < minSuccessRate) return null;

    const now = new Date();
    const before = takeSnapshot(playbook);
    const after: IPlaybookSnapshot = {
      ...before,
      status: "active",
    };

    return createEvolutionRecord(
      playbook.id,
      "reinforced", // Promotion is a form of reinforcement (level change tracked separately)
      `Promoted from build-level to domain-level — ${playbook.evidenceCount} builds, ${(playbook.successRate * 100).toFixed(0)}% success rate`,
      null,
      [],
      before,
      after,
      now,
    );
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function takeSnapshot(playbook: IPlaybook): IPlaybookSnapshot {
  return {
    approach: playbook.approach,
    constraints: [...playbook.constraints],
    successRate: playbook.successRate,
    evidenceCount: playbook.evidenceCount,
    status: playbook.status,
  };
}

function createEvolutionRecord(
  playbookId: string,
  evolutionType: PlaybookEvolutionType,
  description: string,
  triggeringBuildId: string | null,
  evidenceTrailIds: readonly string[],
  before: IPlaybookSnapshot | null,
  after: IPlaybookSnapshot,
  evolvedAt: Date,
): IPlaybookEvolutionRecord {
  return {
    id: "", // Assigned by store
    playbookId,
    evolutionType,
    description,
    triggeringBuildId,
    evidenceTrailIds,
    before,
    after,
    evolvedAt,
  };
}

function newerDate(a: Date | null, b: Date | null): Date | null {
  if (a === null) return b;
  if (b === null) return a;
  return a > b ? a : b;
}
