/**
 * PlaybookExtractor — the Generator in ACE terminology.
 *
 * Analyzes completed build outcomes (trails + violations) to extract
 * reusable playbooks. Synthesizes individual trail decisions into
 * coherent strategies:
 * - Implementation trails → approach steps and key decisions
 * - Dead-end trails → gotchas (phrased as what to do, not what to avoid)
 * - Violation trails → non-negotiable constraints
 * - Cross-build trails → universal patterns
 *
 * Spec Section 6.4 — "the Librarian generates trail entries (Generator)"
 * Spec Section 6.3 — Trail types and their uses
 */

import type {
  IPlaybook,
  IPlaybookDecision,
  IPlaybookGotcha,
  IPlaybookExtraction,
  IPlaybookExtractor,
  IBuildOutcome,
  ITrailEntry,
  IViolationRecord,
} from "@kriptik/shared-interfaces";

/**
 * Minimum number of implementation trails needed to form a playbook.
 * A single trail isn't enough evidence for a strategy — at least 2
 * corroborating decisions are needed.
 */
const MIN_TRAILS_FOR_PLAYBOOK = 2;

/**
 * Similarity threshold for matching an existing playbook's task type.
 * Exact match required for reinforcement.
 */
const EXACT_MATCH = true;

/**
 * PlaybookExtractor — synthesizes build outcomes into playbooks.
 *
 * The extraction process:
 * 1. Group trails by task type
 * 2. For each task type group, check for existing playbooks
 * 3. If existing: generate reinforcement/refinement evidence
 * 4. If new + enough evidence: create a build-level playbook
 * 5. Extract constraints from violation records
 * 6. Synthesize gotchas from dead-end and violation trails
 */
export class PlaybookExtractor implements IPlaybookExtractor {
  extract(
    outcome: IBuildOutcome,
    existingPlaybooks: readonly IPlaybook[],
  ): IPlaybookExtraction {
    const newPlaybooks: Omit<IPlaybook, "id">[] = [];
    const reinforcedPlaybookIds: string[] = [];
    const refinedPlaybookIds: string[] = [];

    // Group trails by task type
    const trailsByTaskType = groupTrailsByTaskType(outcome.trails);

    for (const [taskType, trails] of trailsByTaskType) {
      // Find existing playbooks for this task type
      const matching = existingPlaybooks.filter(
        (pb) => pb.taskType === taskType && pb.status === "active",
      );

      if (matching.length > 0) {
        // Evaluate whether this build provides reinforcement or refinement
        for (const existing of matching) {
          const result = evaluateEvidence(existing, trails, outcome);
          if (result === "reinforced") {
            reinforcedPlaybookIds.push(existing.id);
          } else if (result === "refined") {
            refinedPlaybookIds.push(existing.id);
          }
        }
      } else {
        // No existing playbook — create a new one if enough evidence
        const implementationTrails = trails.filter(
          (t) => t.trailType === "implementation",
        );
        if (implementationTrails.length >= MIN_TRAILS_FOR_PLAYBOOK) {
          const playbook = synthesizePlaybook(
            taskType,
            trails,
            outcome,
          );
          newPlaybooks.push(playbook);
        }
      }
    }

    return {
      newPlaybooks,
      reinforcedPlaybookIds,
      refinedPlaybookIds,
      buildId: outcome.buildId,
    };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Group trails by their task type for per-type extraction.
 */
function groupTrailsByTaskType(
  trails: readonly ITrailEntry[],
): Map<string, ITrailEntry[]> {
  const groups = new Map<string, ITrailEntry[]>();
  for (const trail of trails) {
    const existing = groups.get(trail.taskType) ?? [];
    existing.push(trail);
    groups.set(trail.taskType, existing);
  }
  return groups;
}

/**
 * Evaluate whether a build's trails reinforce or refine an existing playbook.
 *
 * Reinforcement: build used the same approach and succeeded.
 * Refinement: build discovered new gotchas, decisions, or constraints.
 */
function evaluateEvidence(
  existing: IPlaybook,
  trails: readonly ITrailEntry[],
  outcome: IBuildOutcome,
): "reinforced" | "refined" | "none" {
  const hasNewGotchas = trails.some(
    (t) =>
      t.gotchasEncountered.some(
        (g) => !existing.gotchas.some((eg) => eg.situation === g),
      ),
  );

  const hasNewViolations = outcome.violations.some(
    (v) =>
      !existing.constraints.some((c) =>
        c.toLowerCase().includes(v.description.toLowerCase().substring(0, 30)),
      ),
  );

  if (hasNewGotchas || hasNewViolations) {
    return "refined";
  }

  // If the build succeeded with this task type, it's reinforcement
  const successfulTrails = trails.filter(
    (t) =>
      t.trailType === "implementation" &&
      (t.outcome === "passed_first_pass" || t.outcome === "passed_after_fix"),
  );

  if (successfulTrails.length > 0) {
    return "reinforced";
  }

  return "none";
}

/**
 * Synthesize a new build-level playbook from a set of trails.
 *
 * Combines implementation trail decisions into an approach,
 * dead-end trails into gotchas (positive framing), and
 * violation trails into non-negotiable constraints.
 */
function synthesizePlaybook(
  taskType: string,
  trails: readonly ITrailEntry[],
  outcome: IBuildOutcome,
): Omit<IPlaybook, "id"> {
  const implementationTrails = trails.filter(
    (t) => t.trailType === "implementation",
  );
  const deadEndTrails = trails.filter((t) => t.trailType === "dead-end");
  const violationTrails = trails.filter((t) => t.trailType === "violation");

  // Synthesize approach from successful implementation decisions
  const approach = synthesizeApproach(implementationTrails);

  // Extract key decisions with reasoning
  const keyDecisions = extractKeyDecisions(implementationTrails);

  // Synthesize gotchas from dead-ends and trail gotchas (positive framing)
  const gotchas = synthesizeGotchas(implementationTrails, deadEndTrails);

  // Extract constraints from violation trails
  const constraints = extractConstraints(violationTrails, outcome.violations);

  // Collect all dependencies used
  const allDeps = new Set<string>();
  for (const trail of implementationTrails) {
    for (const dep of trail.dependenciesUsed) {
      allDeps.add(dep);
    }
  }

  // Compute success rate from this build's trails
  const successfulCount = implementationTrails.filter(
    (t) => t.outcome === "passed_first_pass" || t.outcome === "passed_after_fix",
  ).length;
  const successRate =
    implementationTrails.length > 0
      ? successfulCount / implementationTrails.length
      : 0;

  // Average evaluator score
  const scores = implementationTrails
    .map((t) => t.evaluatorScore)
    .filter((s): s is number => s !== null);
  const averageEvaluatorScore =
    scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  const now = new Date();

  return {
    taskType,
    level: "build",
    status: "active",
    approach,
    constraints,
    keyDecisions,
    gotchas,
    validatedDependencies: Array.from(allDeps),
    evidenceCount: 1,
    successRate,
    averageEvaluatorScore,
    sourceTrailIds: trails.map((t) => t.id),
    mergedFromIds: [],
    mergedIntoId: null,
    createdAt: now,
    updatedAt: now,
    lastValidatedAt: now,
  };
}

/**
 * Synthesize a coherent approach from implementation trail decisions.
 * Combines individual decisions into a step-by-step strategy.
 */
function synthesizeApproach(trails: readonly ITrailEntry[]): string {
  const successful = trails.filter(
    (t) => t.outcome === "passed_first_pass" || t.outcome === "passed_after_fix",
  );

  if (successful.length === 0) {
    // Fall back to all implementation trails if none fully succeeded
    const decisions = trails.map((t) => t.decision);
    return decisions.join(". ") + ".";
  }

  // Build approach from successful trails' decisions and reasoning
  const steps: string[] = [];
  for (const trail of successful) {
    steps.push(`${trail.decision} (${trail.reasoning})`);
  }

  return steps.join(". ") + ".";
}

/**
 * Extract key decisions with reasoning from implementation trails.
 */
function extractKeyDecisions(
  trails: readonly ITrailEntry[],
): IPlaybookDecision[] {
  const decisionMap = new Map<
    string,
    { reasoning: string; confirmations: number }
  >();

  for (const trail of trails) {
    const existing = decisionMap.get(trail.decision);
    if (existing) {
      existing.confirmations++;
    } else {
      decisionMap.set(trail.decision, {
        reasoning: trail.reasoning,
        confirmations: 1,
      });
    }
  }

  return Array.from(decisionMap.entries()).map(
    ([decision, { reasoning, confirmations }]) => ({
      decision,
      reasoning,
      confirmations,
    }),
  );
}

/**
 * Synthesize gotchas from dead-end trails and implementation trail gotchas.
 * All gotchas are phrased as positive guidance (what to do).
 */
function synthesizeGotchas(
  implementationTrails: readonly ITrailEntry[],
  deadEndTrails: readonly ITrailEntry[],
): IPlaybookGotcha[] {
  const gotchas: IPlaybookGotcha[] = [];
  const seen = new Set<string>();

  // From implementation trail gotchas
  for (const trail of implementationTrails) {
    for (const situation of trail.gotchasEncountered) {
      if (seen.has(situation)) continue;
      seen.add(situation);

      gotchas.push({
        situation,
        // Use the resolution if available, otherwise frame the gotcha positively
        resolution: trail.resolution ?? `Handle: ${situation}`,
        occurrences: 1,
      });
    }
  }

  // From dead-end trails: the dead-end itself becomes a gotcha
  for (const trail of deadEndTrails) {
    const situation = `Approach attempted: ${trail.decision}`;
    if (seen.has(situation)) continue;
    seen.add(situation);

    gotchas.push({
      situation,
      // Positive framing: what to do instead (the reasoning tells us why it failed)
      resolution: trail.resolution ?? `This approach was abandoned because: ${trail.reasoning}. Use an alternative approach.`,
      occurrences: 1,
    });
  }

  return gotchas;
}

/**
 * Extract non-negotiable constraints from violation trails and records.
 * Each constraint is phrased as an architectural requirement.
 *
 * Spec Section 6.3 — "non-negotiable framing: 'X is required — this is
 * an architectural constraint, not a recommendation.'"
 */
function extractConstraints(
  violationTrails: readonly ITrailEntry[],
  violationRecords: readonly IViolationRecord[],
): string[] {
  const constraints: string[] = [];
  const seen = new Set<string>();

  // From violation trails — each becomes a non-negotiable constraint
  for (const trail of violationTrails) {
    const key = trail.decision.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    // Positive framing: what TO do, derived from the violation's resolution
    if (trail.resolution) {
      constraints.push(
        `${trail.resolution} — this is an architectural constraint, not a recommendation.`,
      );
    }
  }

  // From violation records — extract constraint from diagnostics
  for (const record of violationRecords) {
    if (record.severity === "severe") {
      const key = record.description.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      constraints.push(
        `${record.description} — this is an architectural constraint, not a recommendation.`,
      );
    }
  }

  return constraints;
}
