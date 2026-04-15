/**
 * CrossBuildPatternAnalyzer — detects recurring patterns across builds
 * by analyzing accumulated trail data and producing ICrossBuildPattern
 * entries for patterns exceeding statistical thresholds.
 *
 * Implements ICrossBuildPatternAnalyzer from shared-interfaces.
 *
 * Analysis methods:
 * 1. Failure rate analysis — task types with high first-pass failure rates
 * 2. Tech affinity analysis — dependency combinations in successful builds
 * 3. Architectural preference — decisions that recur across successful builds
 * 4. Domain insight — domain-specific patterns emerging from classification
 *
 * Spec Section 6.3 — "Cross-build pattern trails — aggregated insights
 *   that only emerge across many builds."
 * Spec Section 2.3 — "After 1,000 builds, ICE... KNOWS what mistakes
 *   to avoid."
 */

import type {
  ICrossBuildPatternAnalyzer,
  ICrossBuildPattern,
  ICrossBuildAnalysisResult,
  ICrossBuildStatistics,
  CrossBuildPatternCategory,
  IBuildOutcome,
  ITrailEntry,
  TrailOutcome,
} from "@kriptik/shared-interfaces";

/** Minimum builds for a task type before pattern analysis applies. */
const MIN_BUILDS_FOR_ANALYSIS = 5;

/** Minimum failure rate to qualify as a failure-rate pattern. */
const MIN_FAILURE_RATE = 0.35;

/** Minimum co-occurrence rate for tech affinity patterns. */
const MIN_TECH_AFFINITY_RATE = 0.70;

/** Minimum recurrence rate for architectural preference patterns. */
const MIN_ARCHITECTURAL_RECURRENCE = 0.60;

/** Minimum observations for promotion candidacy. */
const MIN_OBSERVATIONS_FOR_PROMOTION = 10;

export class CrossBuildPatternAnalyzer implements ICrossBuildPatternAnalyzer {
  analyzeAll(
    trails: readonly ITrailEntry[],
    existingPatterns: readonly ICrossBuildPattern[],
  ): ICrossBuildAnalysisResult {
    const now = new Date();
    const existingById = new Map(existingPatterns.map((p) => [p.id, p]));

    const newPatterns: Omit<ICrossBuildPattern, "id">[] = [];
    const confirmedIds: string[] = [];
    const updatedIds: string[] = [];
    const promotionCandidates: string[] = [];

    // Group trails by build ID to count unique builds
    const buildIds = new Set(trails.map((t) => t.buildId));

    // --- Failure rate analysis ---
    const failurePatterns = this.analyzeFailureRates(trails, now);
    // --- Tech affinity analysis ---
    const affinityPatterns = this.analyzeTechAffinities(trails, now);
    // --- Architectural preference analysis ---
    const archPatterns = this.analyzeArchitecturalPreferences(trails, now);

    const allDetected = [
      ...failurePatterns,
      ...affinityPatterns,
      ...archPatterns,
    ];

    // Deduplicate against existing patterns
    for (const detected of allDetected) {
      const match = existingPatterns.find(
        (ep) =>
          ep.category === detected.category &&
          this.taskTypesOverlap(ep.taskTypes, detected.taskTypes),
      );

      if (match) {
        // Existing pattern — confirm and update statistics
        confirmedIds.push(match.id);
        if (this.statisticsSignificantlyChanged(match.statistics, detected.statistics)) {
          updatedIds.push(match.id);
        }
      } else {
        newPatterns.push(detected);
      }
    }

    // Check promotion candidacy for existing patterns
    for (const pattern of existingPatterns) {
      if (
        pattern.promotedToTrailId === null &&
        pattern.statistics.significance === "high" &&
        pattern.statistics.observedInBuilds >= MIN_OBSERVATIONS_FOR_PROMOTION
      ) {
        promotionCandidates.push(pattern.id);
      }
    }

    return {
      newPatterns,
      confirmedPatternIds: confirmedIds,
      updatedPatternIds: updatedIds,
      promotionCandidates,
      buildsAnalyzed: buildIds.size,
      trailsAnalyzed: trails.length,
      analyzedAt: now,
    };
  }

  analyzeIncremental(
    buildOutcome: IBuildOutcome,
    existingPatterns: readonly ICrossBuildPattern[],
  ): ICrossBuildAnalysisResult {
    // For incremental analysis, just analyze the build's trails
    // against existing pattern baselines
    return this.analyzeAll(buildOutcome.trails, existingPatterns);
  }

  promoteToTrail(
    pattern: ICrossBuildPattern,
  ): Omit<ITrailEntry, "id"> {
    const taskType = pattern.taskTypes[0] ?? "unknown";
    const now = new Date();

    return {
      trailType: "cross-build",
      taskType,
      decision: pattern.description,
      reasoning: `Cross-build pattern detected across ${pattern.statistics.observedInBuilds} of ${pattern.statistics.totalBuilds} builds (${(pattern.statistics.rate * 100).toFixed(0)}% rate). Category: ${pattern.category}. Significance: ${pattern.statistics.significance}. Trend: ${pattern.statistics.trend}.`,
      outcome: this.patternCategoryToOutcome(pattern.category),
      evaluatorScore: pattern.statistics.averageScore,
      filesAffected: [],
      dependenciesUsed: [],
      gotchasEncountered: [pattern.description],
      resolution: null,
      buildId: `cross-build-${pattern.id}`,
      agentId: "librarian",
      recordedAt: now,
      lastValidatedAt: pattern.lastConfirmedAt,
    };
  }

  // ---------------------------------------------------------------------------
  // Private analysis methods
  // ---------------------------------------------------------------------------

  private analyzeFailureRates(
    trails: readonly ITrailEntry[],
    now: Date,
  ): Omit<ICrossBuildPattern, "id">[] {
    const patterns: Omit<ICrossBuildPattern, "id">[] = [];

    // Group trails by task type
    const byTaskType = this.groupBy(trails, (t) => t.taskType);

    for (const [taskType, taskTrails] of byTaskType) {
      const buildIds = new Set(taskTrails.map((t) => t.buildId));
      if (buildIds.size < MIN_BUILDS_FOR_ANALYSIS) continue;

      // Count first-pass failures (required_rotation, required_firing, abandoned)
      const failureOutcomes: TrailOutcome[] = [
        "required_rotation",
        "required_firing",
        "abandoned",
      ];

      const failedBuilds = new Set<string>();
      for (const trail of taskTrails) {
        if (failureOutcomes.includes(trail.outcome)) {
          failedBuilds.add(trail.buildId);
        }
      }

      const failureRate = failedBuilds.size / buildIds.size;
      if (failureRate < MIN_FAILURE_RATE) continue;

      // Compute average evaluator score
      const scores = taskTrails
        .map((t) => t.evaluatorScore)
        .filter((s): s is number => s !== null);
      const avgScore = scores.length > 0
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : null;

      // Extract common gotchas for the description
      const gotchas = taskTrails.flatMap((t) => t.gotchasEncountered);
      const gotchaFreq = this.frequencyCount(gotchas);
      const topGotcha = gotchaFreq[0]?.[0] ?? "unknown issues";

      patterns.push({
        category: "failure-rate",
        taskTypes: [taskType],
        domain: null,
        description: `Task type "${taskType}" fails on first pass ${(failureRate * 100).toFixed(0)}% of the time (${failedBuilds.size} of ${buildIds.size} builds). Most common issue: ${topGotcha}.`,
        statistics: this.buildStatistics(
          buildIds.size,
          failedBuilds.size,
          failureRate,
          avgScore,
          now,
        ),
        sourceBuildIds: Array.from(buildIds),
        sourceTrailIds: taskTrails.map((t) => t.id),
        detectedAt: now,
        lastConfirmedAt: now,
        promotedToTrailId: null,
      });
    }

    return patterns;
  }

  private analyzeTechAffinities(
    trails: readonly ITrailEntry[],
    now: Date,
  ): Omit<ICrossBuildPattern, "id">[] {
    const patterns: Omit<ICrossBuildPattern, "id">[] = [];

    // Only look at successful implementation trails
    const successTrails = trails.filter(
      (t) =>
        t.trailType === "implementation" &&
        (t.outcome === "passed_first_pass" || t.outcome === "passed_after_fix"),
    );

    // Group by task type
    const byTaskType = this.groupBy(successTrails, (t) => t.taskType);

    for (const [taskType, taskTrails] of byTaskType) {
      const buildIds = new Set(taskTrails.map((t) => t.buildId));
      if (buildIds.size < MIN_BUILDS_FOR_ANALYSIS) continue;

      // Count dependency co-occurrences
      const depCounts = new Map<string, number>();
      const buildDeps = new Map<string, Set<string>>();

      for (const trail of taskTrails) {
        if (!buildDeps.has(trail.buildId)) {
          buildDeps.set(trail.buildId, new Set());
        }
        const deps = buildDeps.get(trail.buildId)!;
        for (const dep of trail.dependenciesUsed) {
          deps.add(dep);
        }
      }

      for (const deps of buildDeps.values()) {
        for (const dep of deps) {
          depCounts.set(dep, (depCounts.get(dep) ?? 0) + 1);
        }
      }

      // Find dependencies used in >70% of successful builds
      for (const [dep, count] of depCounts) {
        const rate = count / buildIds.size;
        if (rate < MIN_TECH_AFFINITY_RATE) continue;

        // Skip trivially common deps (used everywhere)
        if (rate > 0.95) continue;

        patterns.push({
          category: "tech-affinity",
          taskTypes: [taskType],
          domain: null,
          description: `Successful "${taskType}" builds use "${dep}" ${(rate * 100).toFixed(0)}% of the time (${count} of ${buildIds.size} builds).`,
          statistics: this.buildStatistics(
            buildIds.size,
            count,
            rate,
            null,
            now,
          ),
          sourceBuildIds: Array.from(buildIds),
          sourceTrailIds: taskTrails.map((t) => t.id),
          detectedAt: now,
          lastConfirmedAt: now,
          promotedToTrailId: null,
        });
      }
    }

    return patterns;
  }

  private analyzeArchitecturalPreferences(
    trails: readonly ITrailEntry[],
    now: Date,
  ): Omit<ICrossBuildPattern, "id">[] {
    const patterns: Omit<ICrossBuildPattern, "id">[] = [];

    // Only look at successful implementation trails
    const successTrails = trails.filter(
      (t) =>
        t.trailType === "implementation" &&
        (t.outcome === "passed_first_pass" || t.outcome === "passed_after_fix"),
    );

    // Group by task type
    const byTaskType = this.groupBy(successTrails, (t) => t.taskType);

    for (const [taskType, taskTrails] of byTaskType) {
      const buildIds = new Set(taskTrails.map((t) => t.buildId));
      if (buildIds.size < MIN_BUILDS_FOR_ANALYSIS) continue;

      // Analyze decision patterns — group decisions by keywords to find
      // recurring architectural choices
      const decisionKeywords = new Map<string, number>();
      for (const trail of taskTrails) {
        // Extract decision keywords (simplified: first significant phrase)
        const keywords = this.extractDecisionKeywords(trail.decision);
        for (const kw of keywords) {
          decisionKeywords.set(kw, (decisionKeywords.get(kw) ?? 0) + 1);
        }
      }

      // Find decisions that recur in >60% of builds
      for (const [keyword, count] of decisionKeywords) {
        const rate = count / buildIds.size;
        if (rate < MIN_ARCHITECTURAL_RECURRENCE) continue;
        if (keyword.length < 10) continue; // Skip trivially short matches

        patterns.push({
          category: "architectural-pref",
          taskTypes: [taskType],
          domain: null,
          description: `Successful "${taskType}" builds consistently use "${keyword}" (${(rate * 100).toFixed(0)}% of ${buildIds.size} builds).`,
          statistics: this.buildStatistics(
            buildIds.size,
            count,
            rate,
            null,
            now,
          ),
          sourceBuildIds: Array.from(buildIds),
          sourceTrailIds: taskTrails.map((t) => t.id),
          detectedAt: now,
          lastConfirmedAt: now,
          promotedToTrailId: null,
        });
      }
    }

    return patterns;
  }

  // ---------------------------------------------------------------------------
  // Utility methods
  // ---------------------------------------------------------------------------

  private buildStatistics(
    totalBuilds: number,
    observedInBuilds: number,
    rate: number,
    averageScore: number | null,
    now: Date,
  ): ICrossBuildStatistics {
    return {
      totalBuilds,
      observedInBuilds,
      rate,
      averageScore,
      significance: this.computeSignificance(observedInBuilds),
      trend: "stable" as const,
    };
  }

  private computeSignificance(
    observations: number,
  ): "low" | "medium" | "high" {
    if (observations >= 50) return "high";
    if (observations >= 10) return "medium";
    return "low";
  }

  private taskTypesOverlap(
    a: readonly string[],
    b: readonly string[],
  ): boolean {
    const setB = new Set(b);
    return a.some((t) => setB.has(t));
  }

  private statisticsSignificantlyChanged(
    old: ICrossBuildStatistics,
    updated: ICrossBuildStatistics,
  ): boolean {
    // Rate changed by more than 5%
    if (Math.abs(old.rate - updated.rate) > 0.05) return true;
    // Significance level changed
    if (old.significance !== updated.significance) return true;
    // Total builds increased by more than 20%
    if (updated.totalBuilds > old.totalBuilds * 1.2) return true;
    return false;
  }

  private patternCategoryToOutcome(
    category: CrossBuildPatternCategory,
  ): TrailOutcome {
    switch (category) {
      case "failure-rate":
        return "abandoned";
      case "tech-affinity":
      case "architectural-pref":
      case "domain-insight":
        return "passed_first_pass";
      case "timing-pattern":
      case "dependency-pattern":
        return "passed_after_fix";
    }
  }

  private groupBy<T>(
    items: readonly T[],
    keyFn: (item: T) => string,
  ): Map<string, T[]> {
    const groups = new Map<string, T[]>();
    for (const item of items) {
      const key = keyFn(item);
      const group = groups.get(key);
      if (group) {
        group.push(item);
      } else {
        groups.set(key, [item]);
      }
    }
    return groups;
  }

  private frequencyCount(items: readonly string[]): [string, number][] {
    const counts = new Map<string, number>();
    for (const item of items) {
      counts.set(item, (counts.get(item) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }

  private extractDecisionKeywords(decision: string): string[] {
    // Extract meaningful phrases from decisions for pattern matching.
    // Split on common separators and take the longest meaningful phrase.
    const cleaned = decision
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Take the first ~50 chars as a representative keyword
    const keywords: string[] = [];
    if (cleaned.length >= 10) {
      keywords.push(cleaned.slice(0, 50).trim());
    }
    return keywords;
  }
}
