/**
 * DomainKnowledgeCurator — organizes accumulated knowledge by domain,
 * maintains domain-specific playbooks, and identifies cross-domain patterns.
 *
 * Implements IDomainKnowledgeCurator from shared-interfaces.
 *
 * The curator sits between the Playbook system (Step 18), the anti-pattern
 * system (Step 20), and the domain classifier, ensuring that domain-level
 * playbooks are properly curated as builds accumulate within each domain.
 *
 * Spec Section 6.4 — "Domain-level playbooks accumulate strategies across
 *   builds in the same domain."
 * Spec Section 6.6 Layer 5 — "Cross-build knowledge base — the Librarian's
 *   persistent store of trails, anti-patterns, violation records, and domain
 *   playbooks."
 */

import type {
  IDomainKnowledgeCurator,
  IDomainCurationResult,
  IDomainKnowledge,
  IDomainStats,
  ICrossBuildPattern,
  ICrossDomainCandidate,
  IDomainClassification,
  IPlaybook,
  IBuildOutcome,
  IAntiPattern,
  IAntiPatternQuery,
} from "@kriptik/shared-interfaces";

/**
 * Dependencies injected into the DomainKnowledgeCurator.
 * Uses interface types from shared-interfaces to avoid cross-package coupling.
 */
export interface DomainKnowledgeCuratorDeps {
  /** Query playbooks by task type, level, and status. */
  readonly queryPlaybooks: (params: {
    readonly taskTypePrefix?: string;
    readonly level?: "build" | "domain" | "universal";
    readonly status?: "active" | "deprecated" | "retired" | "merged";
    readonly minSuccessRate?: number;
    readonly minEvidence?: number;
  }) => Promise<readonly IPlaybook[]>;

  /** Query anti-patterns by task type and status. */
  readonly queryAntiPatterns: (params: IAntiPatternQuery) => readonly IAntiPattern[];

  /** Query cross-build patterns by domain. */
  readonly queryCrossBuildPatterns: (params: {
    readonly domain?: string;
    readonly taskType?: string;
  }) => readonly ICrossBuildPattern[];
}

/** Minimum builds in a domain before promotion is considered. */
const DEFAULT_MIN_BUILDS_FOR_PROMOTION = 5;

/** Default minimum success rate for promotion. */
const DEFAULT_MIN_SUCCESS_RATE = 0.8;

/** Default minimum domains for universal pattern detection. */
const DEFAULT_MIN_DOMAINS_FOR_UNIVERSAL = 3;

export class DomainKnowledgeCurator implements IDomainKnowledgeCurator {
  private readonly deps: DomainKnowledgeCuratorDeps;

  /** Track domain contributions for statistics. */
  private readonly domainData = new Map<string, {
    buildCount: number;
    taskTypes: Set<string>;
    dependencies: Set<string>;
    scores: number[];
    playbooks: IPlaybook[];
    patterns: ICrossBuildPattern[];
    antiPatterns: IAntiPattern[];
  }>();

  constructor(deps: DomainKnowledgeCuratorDeps) {
    this.deps = deps;
  }

  processBuildContribution(
    buildOutcome: IBuildOutcome,
    classification: IDomainClassification,
    buildPlaybooks: readonly IPlaybook[],
  ): IDomainCurationResult {
    const domain = classification.effectiveDomain;
    const isNewDomain = domain !== null && !this.domainData.has(domain);

    // Initialize domain data if needed
    if (domain !== null) {
      this.ensureDomainData(domain);
      const data = this.domainData.get(domain)!;

      // Record this build's contributions
      data.buildCount++;

      for (const trail of buildOutcome.trails) {
        data.taskTypes.add(trail.taskType);
      }

      for (const dep of buildOutcome.dependencies) {
        data.dependencies.add(dep);
      }

      if (buildOutcome.evaluatorScore !== null) {
        data.scores.push(buildOutcome.evaluatorScore);
      }

      // Add build-level playbooks to domain tracking
      for (const playbook of buildPlaybooks) {
        if (playbook.level === "build") {
          data.playbooks.push(playbook);
        }
      }
    }

    // Identify promotion candidates
    const promotedPlaybookIds: string[] = [];
    if (domain !== null) {
      const candidates = this.identifyPromotionCandidates(domain);
      for (const candidate of candidates) {
        promotedPlaybookIds.push(candidate.id);
      }
    }

    // Detect new cross-build patterns from this domain
    const newPatterns: Omit<ICrossBuildPattern, "id">[] = [];
    if (domain !== null) {
      const data = this.domainData.get(domain)!;

      // Check for domain-specific patterns
      if (data.buildCount >= DEFAULT_MIN_BUILDS_FOR_PROMOTION) {
        const domainPatterns = this.detectDomainPatterns(domain, buildOutcome);
        newPatterns.push(...domainPatterns);
      }
    }

    // Build domain stats
    const domainStats = domain !== null
      ? this.buildDomainStats(domain)
      : {
          buildCount: 0,
          topTaskTypes: [],
          topDependencies: [],
          averageScore: null,
          playbookCount: 0,
        };

    return {
      classification,
      promotedPlaybookIds,
      newPatterns,
      domainStats,
      isNewDomain,
    };
  }

  getDomainKnowledge(domain: string): IDomainKnowledge {
    const data = this.domainData.get(domain);

    if (!data) {
      return {
        domain,
        playbooks: [],
        patterns: [],
        antiPatterns: [],
        commonTaskTypes: [],
        commonDependencies: [],
        stats: {
          buildCount: 0,
          topTaskTypes: [],
          topDependencies: [],
          averageScore: null,
          playbookCount: 0,
        },
      };
    }

    // Get domain-level playbooks from dependency
    const playbooks = data.playbooks.filter(
      (p) => p.status === "active" || p.status === "deprecated",
    );

    return {
      domain,
      playbooks,
      patterns: data.patterns,
      antiPatterns: data.antiPatterns,
      commonTaskTypes: Array.from(data.taskTypes),
      commonDependencies: Array.from(data.dependencies),
      stats: this.buildDomainStats(domain),
    };
  }

  identifyPromotionCandidates(
    domain: string,
    minBuilds: number = DEFAULT_MIN_BUILDS_FOR_PROMOTION,
    minSuccessRate: number = DEFAULT_MIN_SUCCESS_RATE,
  ): readonly IPlaybook[] {
    const data = this.domainData.get(domain);
    if (!data) return [];

    // Find build-level playbooks that qualify for domain promotion
    return data.playbooks.filter(
      (p) =>
        p.level === "build" &&
        p.status === "active" &&
        p.evidenceCount >= minBuilds &&
        p.successRate >= minSuccessRate,
    );
  }

  identifyUniversalCandidates(
    minDomains: number = DEFAULT_MIN_DOMAINS_FOR_UNIVERSAL,
  ): readonly ICrossDomainCandidate[] {
    // Find task types that appear across multiple domains
    const taskTypeDomains = new Map<string, {
      domains: Set<string>;
      totalEvidence: number;
      totalSuccessRate: number;
      successCount: number;
      sourcePlaybookIds: string[];
    }>();

    for (const [domain, data] of this.domainData) {
      for (const playbook of data.playbooks) {
        if (playbook.status !== "active") continue;

        let entry = taskTypeDomains.get(playbook.taskType);
        if (!entry) {
          entry = {
            domains: new Set(),
            totalEvidence: 0,
            totalSuccessRate: 0,
            successCount: 0,
            sourcePlaybookIds: [],
          };
          taskTypeDomains.set(playbook.taskType, entry);
        }

        entry.domains.add(domain);
        entry.totalEvidence += playbook.evidenceCount;
        entry.totalSuccessRate += playbook.successRate;
        entry.successCount++;
        entry.sourcePlaybookIds.push(playbook.id);
      }
    }

    // Filter to task types appearing in enough domains
    const candidates: ICrossDomainCandidate[] = [];
    for (const [taskType, entry] of taskTypeDomains) {
      if (entry.domains.size >= minDomains) {
        candidates.push({
          taskType,
          domains: Array.from(entry.domains),
          totalEvidence: entry.totalEvidence,
          combinedSuccessRate:
            entry.successCount > 0
              ? entry.totalSuccessRate / entry.successCount
              : 0,
          sourcePlaybookIds: entry.sourcePlaybookIds,
        });
      }
    }

    // Sort by number of domains (desc), then evidence (desc)
    candidates.sort((a, b) => {
      const domainDiff = b.domains.length - a.domains.length;
      if (domainDiff !== 0) return domainDiff;
      return b.totalEvidence - a.totalEvidence;
    });

    return candidates;
  }

  // ---------------------------------------------------------------------------
  // Private methods
  // ---------------------------------------------------------------------------

  private ensureDomainData(domain: string): void {
    if (!this.domainData.has(domain)) {
      this.domainData.set(domain, {
        buildCount: 0,
        taskTypes: new Set(),
        dependencies: new Set(),
        scores: [],
        playbooks: [],
        patterns: [],
        antiPatterns: [],
      });
    }
  }

  private buildDomainStats(domain: string): IDomainStats {
    const data = this.domainData.get(domain);
    if (!data) {
      return {
        buildCount: 0,
        topTaskTypes: [],
        topDependencies: [],
        averageScore: null,
        playbookCount: 0,
      };
    }

    const averageScore =
      data.scores.length > 0
        ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length
        : null;

    return {
      buildCount: data.buildCount,
      topTaskTypes: Array.from(data.taskTypes).slice(0, 10),
      topDependencies: Array.from(data.dependencies).slice(0, 10),
      averageScore,
      playbookCount: data.playbooks.filter(
        (p) => p.level === "domain" && p.status === "active",
      ).length,
    };
  }

  private detectDomainPatterns(
    domain: string,
    buildOutcome: IBuildOutcome,
  ): Omit<ICrossBuildPattern, "id">[] {
    const patterns: Omit<ICrossBuildPattern, "id">[] = [];
    const data = this.domainData.get(domain);
    if (!data) return patterns;

    // Detect dependency patterns specific to this domain
    // Find dependencies used in most builds of this domain
    const depCounts = new Map<string, number>();
    for (const dep of data.dependencies) {
      depCounts.set(dep, (depCounts.get(dep) ?? 0) + 1);
    }

    for (const [dep, count] of depCounts) {
      const rate = count / data.buildCount;
      if (rate >= 0.70 && data.buildCount >= DEFAULT_MIN_BUILDS_FOR_PROMOTION) {
        // Check if this pattern already exists
        const existingPattern = data.patterns.find(
          (p) =>
            p.category === "domain-insight" &&
            p.description.includes(dep),
        );

        if (!existingPattern) {
          const now = new Date();
          patterns.push({
            category: "domain-insight",
            taskTypes: Array.from(data.taskTypes),
            domain,
            description: `In "${domain}" builds, "${dep}" is used ${(rate * 100).toFixed(0)}% of the time (${count} of ${data.buildCount} builds).`,
            statistics: {
              totalBuilds: data.buildCount,
              observedInBuilds: count,
              rate,
              averageScore: data.scores.length > 0
                ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length
                : null,
              significance: count >= 50 ? "high" : count >= 10 ? "medium" : "low",
              trend: "stable",
            },
            sourceBuildIds: [buildOutcome.buildId],
            sourceTrailIds: buildOutcome.trails.map((t) => t.id),
            detectedAt: now,
            lastConfirmedAt: now,
            promotedToTrailId: null,
          });
        }
      }
    }

    return patterns;
  }
}
