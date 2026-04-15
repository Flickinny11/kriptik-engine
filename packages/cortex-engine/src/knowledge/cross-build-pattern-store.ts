/**
 * CrossBuildPatternStore — in-memory persistent storage for cross-build
 * patterns detected by the analyzer.
 *
 * Implements ICrossBuildPatternStore from shared-interfaces.
 *
 * Spec Section 6.6 Layer 5 — "Cross-build knowledge base — the Librarian's
 *   persistent store of trails, anti-patterns, violation records, and domain
 *   playbooks."
 */

import type {
  ICrossBuildPattern,
  ICrossBuildPatternQuery,
  ICrossBuildPatternStore,
  CrossBuildPatternCategory,
} from "@kriptik/shared-interfaces";

/** Map significance levels to numeric values for comparison. */
const SIGNIFICANCE_ORDER: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

export class CrossBuildPatternStore implements ICrossBuildPatternStore {
  private readonly patterns = new Map<string, ICrossBuildPattern>();
  private nextId = 1;

  insert(pattern: Omit<ICrossBuildPattern, "id">): ICrossBuildPattern {
    const id = `cbp-${this.nextId++}`;
    const stored: ICrossBuildPattern = { ...pattern, id };
    this.patterns.set(id, stored);
    return stored;
  }

  getById(id: string): ICrossBuildPattern | null {
    return this.patterns.get(id) ?? null;
  }

  query(params: ICrossBuildPatternQuery): readonly ICrossBuildPattern[] {
    let results = Array.from(this.patterns.values());

    if (params.category !== undefined) {
      results = results.filter((p) => p.category === params.category);
    }

    if (params.taskType !== undefined) {
      results = results.filter((p) => p.taskTypes.includes(params.taskType!));
    }

    if (params.domain !== undefined) {
      results = results.filter((p) => p.domain === params.domain);
    }

    if (params.minSignificance !== undefined) {
      const minLevel = SIGNIFICANCE_ORDER[params.minSignificance];
      results = results.filter(
        (p) => SIGNIFICANCE_ORDER[p.statistics.significance] >= minLevel,
      );
    }

    if (params.minObservations !== undefined) {
      results = results.filter(
        (p) => p.statistics.observedInBuilds >= params.minObservations!,
      );
    }

    if (params.detectedAfter !== undefined) {
      const afterMs = params.detectedAfter.getTime();
      results = results.filter((p) => p.detectedAt.getTime() > afterMs);
    }

    // Sort by significance (desc), then rate (desc)
    results.sort((a, b) => {
      const sigDiff =
        SIGNIFICANCE_ORDER[b.statistics.significance] -
        SIGNIFICANCE_ORDER[a.statistics.significance];
      if (sigDiff !== 0) return sigDiff;
      return b.statistics.rate - a.statistics.rate;
    });

    if (params.limit !== undefined) {
      results = results.slice(0, params.limit);
    }

    return results;
  }

  getAll(): readonly ICrossBuildPattern[] {
    return Array.from(this.patterns.values());
  }

  update(
    id: string,
    updates: Partial<
      Pick<
        ICrossBuildPattern,
        | "statistics"
        | "lastConfirmedAt"
        | "promotedToTrailId"
        | "sourceBuildIds"
        | "sourceTrailIds"
      >
    >,
  ): ICrossBuildPattern | null {
    const existing = this.patterns.get(id);
    if (!existing) return null;

    const updated: ICrossBuildPattern = { ...existing, ...updates };
    this.patterns.set(id, updated);
    return updated;
  }

  count(params?: ICrossBuildPatternQuery): number {
    if (!params) return this.patterns.size;
    return this.query(params).length;
  }
}
