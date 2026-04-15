/**
 * PlaybookStore — in-memory persistence for playbooks with structured
 * queries and evolution history tracking.
 *
 * This is an in-memory implementation suitable for single-process deployments.
 * For production persistence, this would be backed by SQLite (like TrailStore)
 * with the same interface contract.
 *
 * Spec Section 6.4 — ACE-Style Evolving Playbooks
 * Spec Section 6.6 Layer 5 — Cross-Build Knowledge Base (permanent persistence)
 */

import type {
  IPlaybook,
  IPlaybookQuery,
  IPlaybookStore,
  IPlaybookEvolutionRecord,
  PlaybookStatus,
} from "@kriptik/shared-interfaces";

/** Generate a unique ID with a prefix. */
function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * In-memory playbook store implementing IPlaybookStore.
 *
 * Stores playbooks and their evolution records in Maps indexed by ID.
 * Supports all query operations defined in the interface contract.
 */
export class PlaybookStore implements IPlaybookStore {
  private readonly playbooks = new Map<string, IPlaybook>();
  private readonly evolutionRecords = new Map<string, IPlaybookEvolutionRecord[]>();

  async initialize(): Promise<void> {
    // In-memory store needs no initialization
  }

  async insert(playbook: Omit<IPlaybook, "id">): Promise<IPlaybook> {
    const id = generateId("pb");
    const stored: IPlaybook = { ...playbook, id };
    this.playbooks.set(id, stored);
    return stored;
  }

  async update(id: string, updates: Partial<Omit<IPlaybook, "id">>): Promise<IPlaybook> {
    const existing = this.playbooks.get(id);
    if (!existing) {
      throw new Error(`Playbook not found: ${id}`);
    }
    const updated: IPlaybook = { ...existing, ...updates, id };
    this.playbooks.set(id, updated);
    return updated;
  }

  async getById(id: string): Promise<IPlaybook | null> {
    return this.playbooks.get(id) ?? null;
  }

  async query(params: IPlaybookQuery): Promise<readonly IPlaybook[]> {
    let results = Array.from(this.playbooks.values());

    results = applyFilters(results, params);
    results = applyOrdering(results, params);

    if (params.limit !== undefined) {
      results = results.slice(0, params.limit);
    }

    return results;
  }

  async count(params: IPlaybookQuery): Promise<number> {
    const filtered = applyFilters(Array.from(this.playbooks.values()), params);
    return filtered.length;
  }

  async getTaskTypeCoverage(): Promise<
    ReadonlyMap<string, { count: number; bestSuccessRate: number }>
  > {
    const coverage = new Map<string, { count: number; bestSuccessRate: number }>();

    for (const playbook of this.playbooks.values()) {
      if (playbook.status === "retired" || playbook.status === "merged") {
        continue;
      }
      const existing = coverage.get(playbook.taskType);
      if (existing) {
        existing.count++;
        if (playbook.successRate > existing.bestSuccessRate) {
          existing.bestSuccessRate = playbook.successRate;
        }
      } else {
        coverage.set(playbook.taskType, {
          count: 1,
          bestSuccessRate: playbook.successRate,
        });
      }
    }

    return coverage;
  }

  async markValidated(playbookId: string, validatedAt: Date): Promise<void> {
    const playbook = this.playbooks.get(playbookId);
    if (!playbook) {
      throw new Error(`Playbook not found: ${playbookId}`);
    }
    this.playbooks.set(playbookId, {
      ...playbook,
      lastValidatedAt: validatedAt,
      updatedAt: validatedAt,
    });
  }

  async recordEvolution(
    record: Omit<IPlaybookEvolutionRecord, "id">,
  ): Promise<IPlaybookEvolutionRecord> {
    const id = generateId("evo");
    const stored: IPlaybookEvolutionRecord = { ...record, id };

    const existing = this.evolutionRecords.get(record.playbookId) ?? [];
    existing.push(stored);
    this.evolutionRecords.set(record.playbookId, existing);

    return stored;
  }

  async getEvolutionHistory(
    playbookId: string,
  ): Promise<readonly IPlaybookEvolutionRecord[]> {
    return this.evolutionRecords.get(playbookId) ?? [];
  }

  async close(): Promise<void> {
    this.playbooks.clear();
    this.evolutionRecords.clear();
  }
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

function applyFilters(
  playbooks: IPlaybook[],
  params: IPlaybookQuery,
): IPlaybook[] {
  return playbooks.filter((pb) => {
    if (params.taskType !== undefined && pb.taskType !== params.taskType) {
      return false;
    }
    if (
      params.taskTypePrefix !== undefined &&
      !pb.taskType.startsWith(params.taskTypePrefix)
    ) {
      return false;
    }
    if (params.level !== undefined && pb.level !== params.level) {
      return false;
    }
    if (params.status !== undefined && pb.status !== params.status) {
      return false;
    }
    if (
      params.validatedAfter !== undefined &&
      (pb.lastValidatedAt === null ||
        pb.lastValidatedAt < params.validatedAfter)
    ) {
      return false;
    }
    if (
      params.minSuccessRate !== undefined &&
      pb.successRate < params.minSuccessRate
    ) {
      return false;
    }
    if (
      params.minEvidence !== undefined &&
      pb.evidenceCount < params.minEvidence
    ) {
      return false;
    }
    return true;
  });
}

function applyOrdering(
  playbooks: IPlaybook[],
  params: IPlaybookQuery,
): IPlaybook[] {
  const { orderBy, orderDirection = "desc" } = params;
  if (!orderBy) return playbooks;

  const direction = orderDirection === "asc" ? 1 : -1;

  return playbooks.sort((a, b) => {
    let aVal: number;
    let bVal: number;

    switch (orderBy) {
      case "successRate":
        aVal = a.successRate;
        bVal = b.successRate;
        break;
      case "evidenceCount":
        aVal = a.evidenceCount;
        bVal = b.evidenceCount;
        break;
      case "updatedAt":
        aVal = a.updatedAt.getTime();
        bVal = b.updatedAt.getTime();
        break;
      case "lastValidatedAt":
        aVal = a.lastValidatedAt?.getTime() ?? 0;
        bVal = b.lastValidatedAt?.getTime() ?? 0;
        break;
      default:
        return 0;
    }

    return (aVal - bVal) * direction;
  });
}
