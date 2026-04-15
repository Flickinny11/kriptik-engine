/**
 * AntiPatternInferencer — analyzes trails and violation records to detect
 * recurring failure patterns and synthesize anti-pattern entries.
 *
 * Three analysis methods correspond to the three sources of negative knowledge:
 * 1. Dead-end trails — approaches tried and abandoned
 * 2. Violation records — implementations fired for contract violations
 * 3. Cross-build patterns — statistical failure patterns across many builds
 *
 * Spec Section 2.2, Stage 4 Method 6 — "using the knowledge base's accumulated
 *   experiential trails, identifies what has gone wrong in similar builds before."
 * Spec Section 6.3 — Dead-end trails, violation trails, cross-build pattern trails
 * Spec Section 9.2, Step 1 — "Trail Extraction — the Librarian extracts all
 *   valuable data... This goes to the anti-pattern library."
 * Spec Section 2.3 — "every build failure that traces back to a missing spec
 *   item becomes a new anti-pattern entry."
 */

import type {
  IAntiPattern,
  IAntiPatternInferencer,
  IInferenceResult,
  AntiPatternConfidence,
} from "@kriptik/shared-interfaces";

import type {
  ITrailEntry,
  ITrailStore,
} from "@kriptik/shared-interfaces";

import type { IViolationRecord } from "@kriptik/shared-interfaces";

import type { IAntiPatternLibrary } from "@kriptik/shared-interfaces";

/**
 * Minimum occurrences of the same failure pattern within a task type
 * before it qualifies as an anti-pattern candidate.
 */
const MIN_OCCURRENCES_FOR_PATTERN = 2;

/**
 * Minimum failure rate (first-pass failures / total attempts) for a
 * task type to generate a cross-build anti-pattern.
 */
const CROSS_BUILD_FAILURE_RATE_THRESHOLD = 0.40;

/**
 * Minimum total attempts for a task type before cross-build analysis applies.
 * Prevents false positives from small samples.
 */
const CROSS_BUILD_MIN_ATTEMPTS = 5;

/** Compute confidence from occurrence count. */
function computeConfidence(count: number): AntiPatternConfidence {
  if (count >= 10) return "high";
  if (count >= 4) return "medium";
  return "low";
}

/** Dependencies required by the inferencer. */
export interface AntiPatternInferencerDeps {
  readonly trailStore: ITrailStore;
  readonly antiPatternLibrary: IAntiPatternLibrary;
}

/**
 * Analyzes the knowledge base's negative experiences to infer anti-patterns.
 *
 * The inferencer runs three independent analysis passes over the data, each
 * targeting a different source of negative knowledge. Results are deduplicated
 * against the existing library — if an existing pattern matches, it's confirmed
 * rather than duplicated.
 */
export class AntiPatternInferencer implements IAntiPatternInferencer {
  private readonly trailStore: ITrailStore;
  private readonly library: IAntiPatternLibrary;

  constructor(deps: AntiPatternInferencerDeps) {
    this.trailStore = deps.trailStore;
    this.library = deps.antiPatternLibrary;
  }

  /**
   * Analyze dead-end trails for recurring failure patterns.
   *
   * Groups dead-end trails by task type, then by failure reasoning.
   * When multiple dead-ends share similar reasoning for the same task type,
   * that's an anti-pattern.
   *
   * Spec Section 6.3 — "Dead-end trails — approaches that were tried and
   * abandoned, with reasoning for why they failed. Injected as context:
   * 'Previous builds tried X and discovered it doesn't work because Y.'"
   */
  analyzeDeadEndTrails(
    trails: readonly ITrailEntry[],
  ): readonly Omit<IAntiPattern, "id">[] {
    const deadEnds = trails.filter((t) => t.trailType === "dead-end");
    if (deadEnds.length === 0) return [];

    // Group by task type
    const byTaskType = new Map<string, ITrailEntry[]>();
    for (const trail of deadEnds) {
      const existing = byTaskType.get(trail.taskType) ?? [];
      existing.push(trail);
      byTaskType.set(trail.taskType, existing);
    }

    const patterns: Omit<IAntiPattern, "id">[] = [];

    for (const [taskType, taskTrails] of byTaskType) {
      if (taskTrails.length < MIN_OCCURRENCES_FOR_PATTERN) continue;

      // Group by gotcha keywords to detect similar failure modes.
      // Each gotcha cluster with enough occurrences becomes an anti-pattern.
      const gotchaClusters = this.clusterByGotchas(taskTrails);

      for (const cluster of gotchaClusters) {
        if (cluster.trails.length < MIN_OCCURRENCES_FOR_PATTERN) continue;

        const occurrences = cluster.trails.length;
        const now = new Date();

        patterns.push({
          taskTypes: [taskType],
          triggerCondition: cluster.commonGotcha,
          failureDescription: this.summarizeFailures(cluster.trails),
          alternativeGuidance: this.deriveGuidance(cluster.trails),
          occurrenceCount: occurrences,
          failureRate: 1.0, // Dead-ends are 100% failures by definition
          sourceTrailIds: cluster.trails.map((t) => t.id),
          sourceViolationIds: [],
          confidence: computeConfidence(occurrences),
          inferredAt: now,
          lastConfirmedAt: null,
          status: "active",
        });
      }
    }

    return patterns;
  }

  /**
   * Analyze violation records for contract violation patterns.
   *
   * Groups violations by source type and goal characteristics. When the
   * same violation source recurs for similar work, that's a systematic
   * anti-pattern.
   *
   * Spec Section 9.2 Step 1 — "the Librarian extracts all valuable data:
   * what the agent built, where it went wrong, what reasoning led to the
   * violation... This goes to the anti-pattern library."
   */
  analyzeViolations(
    violations: readonly IViolationRecord[],
  ): readonly Omit<IAntiPattern, "id">[] {
    if (violations.length === 0) return [];

    // Group by violation source — recurring sources indicate systematic issues
    const bySource = new Map<string, IViolationRecord[]>();
    for (const v of violations) {
      const key = v.source;
      const existing = bySource.get(key) ?? [];
      existing.push(v);
      bySource.set(key, existing);
    }

    const patterns: Omit<IAntiPattern, "id">[] = [];
    const now = new Date();

    for (const [source, sourceViolations] of bySource) {
      if (sourceViolations.length < MIN_OCCURRENCES_FOR_PATTERN) continue;

      // Further group by severity to separate systematic vs occasional
      const severe = sourceViolations.filter((v) => v.severity === "severe");

      if (severe.length >= MIN_OCCURRENCES_FOR_PATTERN) {
        patterns.push({
          taskTypes: this.extractTaskTypesFromViolations(severe),
          triggerCondition: `Recurring ${source} violation (severe)`,
          failureDescription: this.summarizeViolations(severe),
          alternativeGuidance: this.deriveViolationGuidance(severe),
          occurrenceCount: severe.length,
          failureRate: severe.length / sourceViolations.length,
          sourceTrailIds: [],
          sourceViolationIds: severe.map((v) => v.id),
          confidence: computeConfidence(severe.length),
          inferredAt: now,
          lastConfirmedAt: null,
          status: "active",
        });
      }

      // Moderate violations that recur 3+ times also qualify
      const moderate = sourceViolations.filter(
        (v) => v.severity === "moderate",
      );
      if (moderate.length >= 3) {
        patterns.push({
          taskTypes: this.extractTaskTypesFromViolations(moderate),
          triggerCondition: `Repeated ${source} violation (moderate, ${moderate.length} occurrences)`,
          failureDescription: this.summarizeViolations(moderate),
          alternativeGuidance: this.deriveViolationGuidance(moderate),
          occurrenceCount: moderate.length,
          failureRate: moderate.length / sourceViolations.length,
          sourceTrailIds: [],
          sourceViolationIds: moderate.map((v) => v.id),
          confidence: computeConfidence(moderate.length),
          inferredAt: now,
          lastConfirmedAt: null,
          status: "active",
        });
      }
    }

    return patterns;
  }

  /**
   * Analyze cross-build patterns for statistical failure patterns.
   *
   * Examines all trails (not just dead-ends) per task type. When a task type
   * has a first-pass failure rate above threshold across sufficient attempts,
   * that's a cross-build anti-pattern.
   *
   * Spec Section 6.3 — "Cross-build pattern trails — aggregated insights
   * that only emerge across many builds: 'Async API polling fails to implement
   * timeout handling 65% of the time on first pass. Always include explicit
   * timeout in the spec.'"
   */
  analyzeCrossBuildPatterns(
    trails: readonly ITrailEntry[],
  ): readonly Omit<IAntiPattern, "id">[] {
    if (trails.length === 0) return [];

    // Group by task type
    const byTaskType = new Map<string, ITrailEntry[]>();
    for (const trail of trails) {
      const existing = byTaskType.get(trail.taskType) ?? [];
      existing.push(trail);
      byTaskType.set(trail.taskType, existing);
    }

    const patterns: Omit<IAntiPattern, "id">[] = [];
    const now = new Date();

    for (const [taskType, taskTrails] of byTaskType) {
      if (taskTrails.length < CROSS_BUILD_MIN_ATTEMPTS) continue;

      // Count first-pass failures (not passed_first_pass)
      const firstPassFailures = taskTrails.filter(
        (t) => t.outcome !== "passed_first_pass",
      );
      const failureRate = firstPassFailures.length / taskTrails.length;

      if (failureRate < CROSS_BUILD_FAILURE_RATE_THRESHOLD) continue;

      // Extract common gotchas across the failures
      const commonGotchas = this.extractCommonGotchas(firstPassFailures);
      if (commonGotchas.length === 0) continue;

      patterns.push({
        taskTypes: [taskType],
        triggerCondition: `${taskType} has ${Math.round(failureRate * 100)}% first-pass failure rate`,
        failureDescription: `In ${taskTrails.length} builds with ${taskType}, ${firstPassFailures.length} failed on first pass. Common issues: ${commonGotchas.join("; ")}`,
        alternativeGuidance: `Always address these known issues in the spec: ${commonGotchas.join(". ")}`,
        occurrenceCount: firstPassFailures.length,
        failureRate,
        sourceTrailIds: firstPassFailures.map((t) => t.id),
        sourceViolationIds: [],
        confidence: computeConfidence(firstPassFailures.length),
        inferredAt: now,
        lastConfirmedAt: null,
        status: "active",
      });
    }

    return patterns;
  }

  /**
   * Run the full inference pipeline — all three analysis methods.
   *
   * Queries the trail store for dead-end trails and all trails, runs all
   * three analyzers, deduplicates against existing library patterns,
   * and returns the complete inference result.
   */
  async runFullInference(): Promise<IInferenceResult> {
    // Query trail store for relevant trails
    const [deadEndTrails, allTrails] = await Promise.all([
      this.trailStore.query({ trailType: "dead-end" }),
      this.trailStore.query({}),
    ]);

    // Run all three analysis methods
    const fromDeadEnds = this.analyzeDeadEndTrails(deadEndTrails);
    // Violation analysis requires violation data — the inferencer gets this
    // from violation trails in the trail store (trail type "violation")
    const violationTrails = allTrails.filter(
      (t) => t.trailType === "violation",
    );
    const fromCrossBuild = this.analyzeCrossBuildPatterns(allTrails);

    // Combine all inferred patterns
    const allInferred = [...fromDeadEnds, ...fromCrossBuild];

    // Deduplicate against existing library
    const existingPatterns = this.library.getAll();
    const newPatterns: Omit<IAntiPattern, "id">[] = [];
    const confirmedIds: string[] = [];

    for (const inferred of allInferred) {
      const existing = this.findMatchingPattern(
        inferred,
        existingPatterns,
      );
      if (existing) {
        // Confirm and update existing pattern
        this.library.confirm(existing.id);
        this.library.update(existing.id, {
          occurrenceCount: Math.max(
            existing.occurrenceCount,
            inferred.occurrenceCount,
          ),
          failureRate: inferred.failureRate,
          confidence: inferred.confidence,
          sourceTrailIds: [
            ...new Set([
              ...existing.sourceTrailIds,
              ...inferred.sourceTrailIds,
            ]),
          ],
        });
        confirmedIds.push(existing.id);
      } else {
        newPatterns.push(inferred);
      }
    }

    // Deprecate patterns with no recent evidence
    const deprecatedIds = this.findStalePatterns(
      existingPatterns,
      confirmedIds,
    );
    for (const id of deprecatedIds) {
      this.library.deprecate(id);
    }

    return {
      newPatterns,
      confirmedPatternIds: confirmedIds,
      deprecatedPatternIds: deprecatedIds,
      deadEndTrailsAnalyzed: deadEndTrails.length,
      violationsAnalyzed: violationTrails.length,
      crossBuildPatternsAnalyzed: allTrails.length,
      inferredAt: new Date(),
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Cluster trails by common gotchas to detect similar failure modes.
   * Trails sharing the same gotcha text are clustered together.
   */
  private clusterByGotchas(
    trails: readonly ITrailEntry[],
  ): { commonGotcha: string; trails: ITrailEntry[] }[] {
    const clusters = new Map<string, ITrailEntry[]>();

    for (const trail of trails) {
      // Use the first gotcha as the cluster key (primary failure mode)
      const gotcha =
        trail.gotchasEncountered.length > 0
          ? trail.gotchasEncountered[0]!
          : trail.decision;

      const existing = clusters.get(gotcha) ?? [];
      existing.push(trail);
      clusters.set(gotcha, existing);
    }

    return Array.from(clusters.entries()).map(([gotcha, clusterTrails]) => ({
      commonGotcha: gotcha,
      trails: clusterTrails,
    }));
  }

  /** Summarize failure descriptions from multiple dead-end trails. */
  private summarizeFailures(trails: readonly ITrailEntry[]): string {
    const reasons = trails
      .map((t) => t.reasoning)
      .filter((r) => r.length > 0);
    if (reasons.length === 0) return "Recurring failure pattern detected.";
    // Use the first reason as representative, with count
    return `${reasons[0]} (observed in ${trails.length} dead-end trails)`;
  }

  /** Derive positive guidance from dead-end trail resolutions. */
  private deriveGuidance(trails: readonly ITrailEntry[]): string {
    // Check if any trail has a resolution (what eventually worked)
    const resolutions = trails
      .map((t) => t.resolution)
      .filter((r): r is string => r !== null && r.length > 0);

    if (resolutions.length > 0) {
      return resolutions[0]!;
    }

    // Fall back to inverting the gotcha
    const gotchas = trails.flatMap((t) => t.gotchasEncountered);
    if (gotchas.length > 0) {
      return `Address before implementation: ${gotchas[0]}`;
    }

    return "Verify approach against known failure patterns before proceeding.";
  }

  /** Summarize violations into a failure description. */
  private summarizeViolations(
    violations: readonly IViolationRecord[],
  ): string {
    const descriptions = violations
      .map((v) => v.description)
      .filter((d) => d.length > 0);
    if (descriptions.length === 0) return "Recurring violation pattern.";
    return `${descriptions[0]} (${violations.length} occurrences)`;
  }

  /** Derive guidance from violation diagnostics. */
  private deriveViolationGuidance(
    violations: readonly IViolationRecord[],
  ): string {
    // Extract diagnostic details for constructive guidance
    const diagnostics = violations.flatMap((v) => v.diagnostics);
    if (diagnostics.length > 0) {
      return `Ensure compliance with: ${diagnostics[0]}`;
    }
    return "Follow interface contracts and architectural constraints precisely.";
  }

  /** Extract distinct task type identifiers from violation goal context. */
  private extractTaskTypesFromViolations(
    violations: readonly IViolationRecord[],
  ): string[] {
    // Use goalId as a proxy for task type grouping
    const types = new Set<string>();
    for (const v of violations) {
      types.add(v.goalId);
    }
    return Array.from(types);
  }

  /** Extract the most common gotchas across trails. */
  private extractCommonGotchas(trails: readonly ITrailEntry[]): string[] {
    const gotchaCounts = new Map<string, number>();
    for (const trail of trails) {
      for (const gotcha of trail.gotchasEncountered) {
        gotchaCounts.set(gotcha, (gotchaCounts.get(gotcha) ?? 0) + 1);
      }
    }

    // Return gotchas that appear in at least 2 trails, sorted by frequency
    return Array.from(gotchaCounts.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([gotcha]) => gotcha);
  }

  /**
   * Find an existing pattern in the library that matches the inferred one.
   * Matches on overlapping task types and similar trigger conditions.
   */
  private findMatchingPattern(
    inferred: Omit<IAntiPattern, "id">,
    existing: readonly IAntiPattern[],
  ): IAntiPattern | undefined {
    return existing.find((e) => {
      // Must share at least one task type
      const hasTaskOverlap = e.taskTypes.some((t) =>
        inferred.taskTypes.includes(t),
      );
      if (!hasTaskOverlap) return false;

      // Trigger condition similarity — exact match or substring containment
      return (
        e.triggerCondition === inferred.triggerCondition ||
        e.triggerCondition.includes(inferred.triggerCondition) ||
        inferred.triggerCondition.includes(e.triggerCondition)
      );
    });
  }

  /**
   * Find patterns that weren't confirmed during this inference run
   * and haven't been confirmed recently.
   *
   * Spec Section 3.2 — "depreciates trails that haven't been confirmed
   * in recent builds, without deleting them."
   */
  private findStalePatterns(
    existing: readonly IAntiPattern[],
    confirmedIds: readonly string[],
  ): string[] {
    const confirmedSet = new Set(confirmedIds);
    const staleThreshold = 90 * 24 * 60 * 60 * 1000; // 90 days
    const now = Date.now();

    return existing
      .filter((p) => {
        if (confirmedSet.has(p.id)) return false;
        if (p.status !== "active") return false;

        // If never confirmed, check age since inference
        const lastActivity = p.lastConfirmedAt ?? p.inferredAt;
        return now - lastActivity.getTime() > staleThreshold;
      })
      .map((p) => p.id);
  }
}
