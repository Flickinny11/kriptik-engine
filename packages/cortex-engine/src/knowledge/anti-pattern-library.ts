/**
 * AntiPatternLibrary — in-memory persistent store for inferred anti-patterns.
 *
 * Managed by the Librarian as part of the knowledge base. Stores anti-patterns
 * inferred from dead-end trails, violation records, and cross-build failure
 * patterns. Provides query/retrieval for ICE Stage 4 and golden window formation.
 *
 * Spec Section 3.2 — "Manages the knowledge base... Maintains the anti-pattern library."
 * Spec Section 4.2 — Tier 1 Shared Services: "Knowledge Base (Librarian) —
 *   Experiential trails, anti-patterns, cross-build patterns — Permanent, cross-project."
 * Spec Section 6.6 Layer 5 — "Cross-build knowledge base — the Librarian's persistent
 *   store of trails, anti-patterns, violation records, and domain playbooks."
 */

import type {
  IAntiPattern,
  IAntiPatternLibrary,
  IAntiPatternQuery,
  AntiPatternConfidence,
} from "@kriptik/shared-interfaces";

/** Confidence level ordering for comparison. */
const CONFIDENCE_ORDER: Record<AntiPatternConfidence, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

/**
 * In-memory implementation of the anti-pattern library.
 *
 * Like PlaybookStore and RoutingMetricsTracker, starts in-memory.
 * Persistence to disk can follow the same pattern as the trail store
 * when cross-session durability is needed.
 */
export class AntiPatternLibrary implements IAntiPatternLibrary {
  private readonly patterns: Map<string, IAntiPattern> = new Map();
  private nextId = 1;

  insert(antiPattern: Omit<IAntiPattern, "id">): IAntiPattern {
    const id = `ap-${this.nextId++}`;
    const entry: IAntiPattern = { ...antiPattern, id };
    this.patterns.set(id, entry);
    return entry;
  }

  getById(id: string): IAntiPattern | null {
    return this.patterns.get(id) ?? null;
  }

  query(params: IAntiPatternQuery): readonly IAntiPattern[] {
    let results = Array.from(this.patterns.values());

    // Default to active-only unless explicitly specified
    const statusFilter = params.status ?? "active";
    results = results.filter((p) => p.status === statusFilter);

    if (params.taskType !== undefined) {
      results = results.filter((p) =>
        p.taskTypes.includes(params.taskType!),
      );
    }

    if (params.minConfidence !== undefined) {
      const minOrder = CONFIDENCE_ORDER[params.minConfidence];
      results = results.filter(
        (p) => CONFIDENCE_ORDER[p.confidence] >= minOrder,
      );
    }

    if (params.minOccurrences !== undefined) {
      results = results.filter(
        (p) => p.occurrenceCount >= params.minOccurrences!,
      );
    }

    if (params.minFailureRate !== undefined) {
      results = results.filter(
        (p) => p.failureRate >= params.minFailureRate!,
      );
    }

    // Sort by confidence (desc) then failure rate (desc) for consistent ordering
    results.sort((a, b) => {
      const confDiff =
        CONFIDENCE_ORDER[b.confidence] - CONFIDENCE_ORDER[a.confidence];
      if (confDiff !== 0) return confDiff;
      return b.failureRate - a.failureRate;
    });

    if (params.limit !== undefined) {
      results = results.slice(0, params.limit);
    }

    return results;
  }

  getAll(): readonly IAntiPattern[] {
    return Array.from(this.patterns.values()).filter(
      (p) => p.status === "active",
    );
  }

  update(
    id: string,
    updates: Partial<
      Pick<
        IAntiPattern,
        | "occurrenceCount"
        | "failureRate"
        | "confidence"
        | "lastConfirmedAt"
        | "status"
        | "sourceTrailIds"
        | "sourceViolationIds"
        | "alternativeGuidance"
      >
    >,
  ): IAntiPattern | null {
    const existing = this.patterns.get(id);
    if (!existing) return null;

    const updated: IAntiPattern = { ...existing, ...updates };
    this.patterns.set(id, updated);
    return updated;
  }

  deprecate(id: string): void {
    const existing = this.patterns.get(id);
    if (existing) {
      this.patterns.set(id, { ...existing, status: "deprecated" });
    }
  }

  confirm(id: string): void {
    const existing = this.patterns.get(id);
    if (existing) {
      this.patterns.set(id, {
        ...existing,
        lastConfirmedAt: new Date(),
      });
    }
  }

  count(params?: IAntiPatternQuery): number {
    if (!params) {
      return Array.from(this.patterns.values()).filter(
        (p) => p.status === "active",
      ).length;
    }
    return this.query(params).length;
  }
}
