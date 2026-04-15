/**
 * Violation detector — monitors merge gate failures, drift signals, and
 * quality degradation to classify violations and determine escalation level.
 *
 * The detector maintains per-agent, per-goal violation history to track
 * escalation through the six levels defined in Spec Section 9.0.
 *
 * Classification logic per Spec Section 9.1:
 *   Minor — LSP errors (typo, missing import), first-time scope adjustment,
 *     individual edge-case test failure. Agent reasoning is sound; error
 *     is mechanical. If 3+ minor rejections on the same work → Moderate.
 *   Moderate — Repeated minor rejections (3+), test failure on core logic,
 *     scope violation suggesting the agent crosses module boundaries.
 *   Severe — Interface contract violation, architectural blueprint deviation,
 *     or a moderate issue where the rotated replacement also fails.
 *
 * Spec Section 9.0 — The Absolute Rule: No Retry Limit, No Abandonment
 * Spec Section 9.1 — Severity Classification
 * Spec Section 9.3 — The Compound Effect: Firing Gets Rarer
 */

import { randomUUID } from "node:crypto";
import type {
  IViolationDetector,
  IViolationRecord,
  ViolationSeverity,
  ViolationSource,
  EscalationLevel,
  IMergeGateResult,
  IDriftSignal,
} from "@kriptik/shared-interfaces";

/** Minor violation threshold: 3+ minors on same goal escalates to moderate. */
const MINOR_ACCUMULATION_THRESHOLD = 3;

/**
 * ViolationDetector — classifies merge failures and drift signals into
 * violation records with severity and escalation level.
 *
 * Stateful: maintains per-agent and per-goal violation history so that
 * escalation decisions account for accumulated failures.
 */
export class ViolationDetector implements IViolationDetector {
  /** Violations keyed by agentId. */
  private readonly _byAgent = new Map<string, IViolationRecord[]>();
  /** Violations keyed by goalId. */
  private readonly _byGoal = new Map<string, IViolationRecord[]>();
  /** Violations keyed by buildId. */
  private readonly _byBuild = new Map<string, IViolationRecord[]>();
  /** Tracks which agents are replacements for fired agents. */
  private readonly _replacements = new Map<string, string>(); // agentId → firedAgentId

  processMergeFailure(
    agentId: string,
    goalId: string,
    buildId: string,
    mergeResult: IMergeGateResult,
  ): IViolationRecord {
    const failedChecks = mergeResult.checks.filter((c) => !c.passed);
    const diagnostics = failedChecks.flatMap((c) => c.diagnostics);
    const source = this.classifyMergeSource(failedChecks);
    const priorCount = this.getGoalViolationCount(agentId, goalId);
    const isReplacement = this._replacements.has(agentId);
    const severity = this.classifyMergeSeverity(
      failedChecks,
      priorCount,
      isReplacement,
    );
    const escalationLevel = this.computeEscalation(
      severity,
      priorCount,
      isReplacement,
    );

    const description = this.buildMergeDescription(failedChecks);

    const record: IViolationRecord = {
      id: randomUUID(),
      buildId,
      agentId,
      goalId,
      severity,
      source,
      escalationLevel,
      description,
      diagnostics,
      mergeGateResult: mergeResult,
      driftSignal: null,
      priorViolationCount: priorCount,
      isReplacementAgent: isReplacement,
      detectedAt: new Date(),
    };

    this.store(record);
    return record;
  }

  processDriftSignal(
    agentId: string,
    goalId: string,
    buildId: string,
    signal: IDriftSignal,
  ): IViolationRecord | null {
    // Only critical drift signals produce violation records.
    // Warning-level signals feed the rotation decision system, not violations.
    if (signal.severity !== "critical") {
      return null;
    }

    const priorCount = this.getGoalViolationCount(agentId, goalId);
    const isReplacement = this._replacements.has(agentId);

    const record: IViolationRecord = {
      id: randomUUID(),
      buildId,
      agentId,
      goalId,
      severity: "moderate",
      source: "drift-signal",
      escalationLevel: isReplacement ? "firing" : "rotation",
      description: `Critical drift detected: ${signal.description} (${signal.source} score: ${signal.score.toFixed(2)})`,
      diagnostics: [
        `Signal source: ${signal.source}`,
        `Score: ${signal.score.toFixed(2)}`,
        `Description: ${signal.description}`,
      ],
      mergeGateResult: null,
      driftSignal: signal,
      priorViolationCount: priorCount,
      isReplacementAgent: isReplacement,
      detectedAt: new Date(),
    };

    this.store(record);
    return record;
  }

  processQualityFailure(
    agentId: string,
    goalId: string,
    buildId: string,
    qualityScore: number,
    threshold: number,
  ): IViolationRecord {
    const priorCount = this.getGoalViolationCount(agentId, goalId);
    const isReplacement = this._replacements.has(agentId);

    // Quality failures are moderate unless the agent is a replacement
    // (in which case the same goal has already been fired once)
    const severity: ViolationSeverity = isReplacement ? "severe" : "moderate";
    const escalationLevel = this.computeEscalation(
      severity,
      priorCount,
      isReplacement,
    );

    const record: IViolationRecord = {
      id: randomUUID(),
      buildId,
      agentId,
      goalId,
      severity,
      source: "quality-degradation",
      escalationLevel,
      description: `Design quality score ${qualityScore.toFixed(1)} below threshold ${threshold.toFixed(1)}`,
      diagnostics: [
        `Quality score: ${qualityScore.toFixed(1)}`,
        `Required threshold: ${threshold.toFixed(1)}`,
        `Deficit: ${(threshold - qualityScore).toFixed(1)} points`,
      ],
      mergeGateResult: null,
      driftSignal: null,
      priorViolationCount: priorCount,
      isReplacementAgent: isReplacement,
      detectedAt: new Date(),
    };

    this.store(record);
    return record;
  }

  getEscalationLevel(agentId: string, goalId: string): EscalationLevel {
    const agentViolations = (this._byAgent.get(agentId) ?? []).filter(
      (v) => v.goalId === goalId,
    );

    if (agentViolations.length === 0) {
      return "fix-and-resubmit";
    }

    // Return the highest escalation level from recorded violations
    const levels: EscalationLevel[] = agentViolations.map(
      (v) => v.escalationLevel,
    );
    return highestEscalation(levels);
  }

  getAgentViolations(agentId: string): readonly IViolationRecord[] {
    return this._byAgent.get(agentId) ?? [];
  }

  getGoalViolations(goalId: string): readonly IViolationRecord[] {
    return this._byGoal.get(goalId) ?? [];
  }

  getBuildViolations(buildId: string): readonly IViolationRecord[] {
    return this._byBuild.get(buildId) ?? [];
  }

  registerReplacement(agentId: string, firedAgentId: string): void {
    this._replacements.set(agentId, firedAgentId);
  }

  // ---------------------------------------------------------------------------
  // Classification logic
  // ---------------------------------------------------------------------------

  /**
   * Determine the primary violation source from failed merge checks.
   * Priority: contract > banned-pattern > test > scope > lsp.
   * Contract violations are the most severe (Section 9.1).
   */
  private classifyMergeSource(
    failedChecks: readonly { check: string; diagnostics: readonly string[] }[],
  ): ViolationSource {
    const checkTypes = new Set(failedChecks.map((c) => c.check));

    if (checkTypes.has("contract")) return "merge-gate-contract";
    if (checkTypes.has("banned-pattern")) return "merge-gate-banned";
    if (checkTypes.has("test")) return "merge-gate-test";
    if (checkTypes.has("scope")) return "merge-gate-scope";
    return "merge-gate-lsp";
  }

  /**
   * Classify merge failure severity per Section 9.1.
   *
   * Severe: contract violations, blueprint deviations
   * Moderate: repeated minors (3+), core test failures, cross-boundary scope
   * Minor: LSP errors, first scope adjustment, edge-case test failure
   */
  private classifyMergeSeverity(
    failedChecks: readonly { check: string; diagnostics: readonly string[] }[],
    priorViolationCount: number,
    isReplacement: boolean,
  ): ViolationSeverity {
    const checkTypes = new Set(failedChecks.map((c) => c.check));

    // Severe: interface contract violations are always severe.
    // Spec Section 9.1 — "Interface contract violation → Severe — Firing"
    if (checkTypes.has("contract")) {
      return "severe";
    }

    // If this is a replacement agent and it also fails → severe.
    // Spec Section 9.1 — "moderate issue where the rotated replacement also fails"
    if (isReplacement && priorViolationCount > 0) {
      return "severe";
    }

    // Moderate: accumulated minor failures escalate.
    // Spec Section 9.1 — "If an agent accumulates 3+ minor rejections
    // on the same work, escalate to Moderate"
    if (priorViolationCount >= MINOR_ACCUMULATION_THRESHOLD) {
      return "moderate";
    }

    // Moderate: scope violations suggesting the agent crosses module boundaries
    // (not just a first-time path adjustment but a fundamental approach issue)
    if (checkTypes.has("scope") && priorViolationCount > 0) {
      return "moderate";
    }

    // Moderate: banned pattern violations indicate the agent is ignoring
    // the design system — this is an approach-level problem
    if (checkTypes.has("banned-pattern") && priorViolationCount > 0) {
      return "moderate";
    }

    // Minor: everything else (LSP errors, first scope adjustment,
    // first test failure, first banned pattern)
    return "minor";
  }

  /**
   * Compute the escalation level from severity and context.
   *
   * Spec Section 9.0 — escalation through fundamentally different approaches:
   * 1. fix-and-resubmit (minor)
   * 2. rotation (moderate with degradation)
   * 3. firing (severe)
   * 4. architect-replan (replacement also fails severe)
   * 5. goal-decomposition (architect-replan has been tried)
   * 6. model-escalation (all else exhausted)
   */
  private computeEscalation(
    severity: ViolationSeverity,
    priorViolationCount: number,
    isReplacement: boolean,
  ): EscalationLevel {
    switch (severity) {
      case "minor":
        return "fix-and-resubmit";

      case "moderate":
        // If accumulated enough minors, rotating gives a fresh context
        if (priorViolationCount >= MINOR_ACCUMULATION_THRESHOLD) {
          return "rotation";
        }
        // Moderate signals suggest the approach may be wrong
        return "rotation";

      case "severe":
        if (!isReplacement) {
          // First severe violation → fire and replace
          return "firing";
        }
        // Replacement also failed severe → escalate beyond firing.
        // Spec Section 9.2 — "If a replacement agent also fails at the
        // same goal, the Cortex escalates further"
        if (priorViolationCount <= 1) {
          return "architect-replan";
        }
        if (priorViolationCount <= 2) {
          return "goal-decomposition";
        }
        return "model-escalation";
    }
  }

  /**
   * Build a human-readable description from failed merge checks.
   */
  private buildMergeDescription(
    failedChecks: readonly { check: string; diagnostics: readonly string[] }[],
  ): string {
    const checkNames = failedChecks.map((c) => c.check).join(", ");
    const totalDiagnostics = failedChecks.reduce(
      (sum, c) => sum + c.diagnostics.length,
      0,
    );
    return `Merge gate failed: ${checkNames} (${totalDiagnostics} diagnostic${totalDiagnostics === 1 ? "" : "s"})`;
  }

  // ---------------------------------------------------------------------------
  // Storage helpers
  // ---------------------------------------------------------------------------

  private store(record: IViolationRecord): void {
    const agentList = this._byAgent.get(record.agentId) ?? [];
    agentList.push(record);
    this._byAgent.set(record.agentId, agentList);

    const goalList = this._byGoal.get(record.goalId) ?? [];
    goalList.push(record);
    this._byGoal.set(record.goalId, goalList);

    const buildList = this._byBuild.get(record.buildId) ?? [];
    buildList.push(record);
    this._byBuild.set(record.buildId, buildList);
  }

  /** Count violations for a specific agent on a specific goal. */
  private getGoalViolationCount(agentId: string, goalId: string): number {
    const agentViolations = this._byAgent.get(agentId) ?? [];
    return agentViolations.filter((v) => v.goalId === goalId).length;
  }
}

// ---------------------------------------------------------------------------
// Escalation ordering
// ---------------------------------------------------------------------------

const ESCALATION_ORDER: readonly EscalationLevel[] = [
  "fix-and-resubmit",
  "rotation",
  "firing",
  "architect-replan",
  "goal-decomposition",
  "model-escalation",
];

/** Return the highest escalation level from a list. */
function highestEscalation(levels: readonly EscalationLevel[]): EscalationLevel {
  let maxIndex = 0;
  for (const level of levels) {
    const index = ESCALATION_ORDER.indexOf(level);
    if (index > maxIndex) {
      maxIndex = index;
    }
  }
  return ESCALATION_ORDER[maxIndex]!;
}
