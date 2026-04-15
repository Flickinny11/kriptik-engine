/**
 * PlaybookApplicator — selects and formats playbooks for injection into
 * agent golden windows during goal assignment.
 *
 * The Applicator bridges the knowledge base and agent context. When an agent
 * receives a goal, the Applicator selects the most relevant playbooks and
 * formats them as structured guidance for the golden window's trail section.
 *
 * Playbook injection supplements (not replaces) trail injection:
 * - Playbooks provide synthesized strategies (the "what and why")
 * - Trails provide specific examples (the "how others did it")
 * Together they give agents both strategic guidance and concrete reference.
 *
 * Spec Section 6.4 — ACE-Style Evolving Playbooks
 * Spec Section 6.3 — "The top 3-7 trails are injected, consuming
 * approximately 2,000-5,000 tokens of the golden window."
 */

import type {
  IPlaybook,
  IPlaybookApplicator,
  IPlaybookSelection,
  IPlaybookStore,
  PlaybookLevel,
} from "@kriptik/shared-interfaces";

/** Default token budget for playbook content in the golden window. */
const DEFAULT_MAX_TOKENS = 3000;

/** Default maximum number of playbooks to inject. */
const DEFAULT_MAX_PLAYBOOKS = 3;

/** Approximate tokens per character for budget estimation. */
const CHARS_PER_TOKEN = 4;

/**
 * Configuration for the PlaybookApplicator.
 */
export interface PlaybookApplicatorConfig {
  /** The playbook store to query. */
  readonly store: IPlaybookStore;
}

/**
 * PlaybookApplicator — selects relevant playbooks and formats them for
 * golden window injection.
 *
 * Selection ranking factors:
 * 1. Task type match — exact match ranks highest
 * 2. Domain match — same-domain playbooks for domain-level
 * 3. Tech stack match — playbooks validated against same dependencies
 * 4. Success rate — higher success rate ranks higher
 * 5. Freshness — recently validated playbooks rank higher
 * 6. Level — build-level preferred, domain and universal supplement
 */
export class PlaybookApplicator implements IPlaybookApplicator {
  private readonly store: IPlaybookStore;

  constructor(config: PlaybookApplicatorConfig) {
    this.store = config.store;
  }

  async select(
    taskType: string,
    domain: string | null,
    dependencies: readonly string[],
    maxTokens: number = DEFAULT_MAX_TOKENS,
    maxPlaybooks: number = DEFAULT_MAX_PLAYBOOKS,
  ): Promise<IPlaybookSelection> {
    // Query candidates from the store: active playbooks matching this task type
    const exactMatches = await this.store.query({
      taskType,
      status: "active",
      orderBy: "successRate",
      orderDirection: "desc",
      limit: 10,
    });

    // Also query domain-level playbooks by prefix if task type has segments
    const domainPrefix = extractDomainPrefix(taskType);
    let domainMatches: readonly IPlaybook[] = [];
    if (domainPrefix) {
      domainMatches = await this.store.query({
        taskTypePrefix: domainPrefix,
        level: "domain",
        status: "active",
        orderBy: "successRate",
        orderDirection: "desc",
        limit: 5,
      });
    }

    // Query universal playbooks
    const universalMatches = await this.store.query({
      level: "universal",
      status: "active",
      orderBy: "evidenceCount",
      orderDirection: "desc",
      limit: 3,
    });

    // Combine all candidates and score them
    const allCandidates = deduplicateById([
      ...exactMatches,
      ...domainMatches,
      ...universalMatches,
    ]);

    const scored = allCandidates.map((pb) => ({
      playbook: pb,
      score: computeRelevanceScore(pb, taskType, domain, dependencies),
    }));

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Select top playbooks within token budget
    const selected: IPlaybook[] = [];
    const reasoning: string[] = [];
    let tokenEstimate = 0;

    for (const { playbook, score } of scored) {
      if (selected.length >= maxPlaybooks) break;

      const formatted = formatSinglePlaybook(playbook);
      const playbookTokens = Math.ceil(formatted.length / CHARS_PER_TOKEN);

      if (tokenEstimate + playbookTokens > maxTokens) {
        reasoning.push(
          `Skipped "${playbook.taskType}" (${playbook.level}) — would exceed token budget`,
        );
        continue;
      }

      selected.push(playbook);
      tokenEstimate += playbookTokens;
      reasoning.push(
        `Selected "${playbook.taskType}" (${playbook.level}, score: ${score.toFixed(2)}, success: ${(playbook.successRate * 100).toFixed(0)}%, evidence: ${playbook.evidenceCount})`,
      );
    }

    const formattedContent =
      selected.length > 0
        ? formatPlaybooksForInjection(selected)
        : "";

    return {
      playbooks: selected,
      formattedContent,
      tokenEstimate,
      selectionReasoning: reasoning,
    };
  }
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Compute a composite relevance score for a playbook candidate.
 *
 * Factors and weights:
 * - Task type match: 0.35 (exact match = 1.0, prefix match = 0.5, none = 0)
 * - Success rate: 0.25 (direct proportion)
 * - Tech stack match: 0.20 (Jaccard similarity of dependencies)
 * - Freshness: 0.10 (decay over 30 days)
 * - Level bonus: 0.10 (build = 1.0, domain = 0.8, universal = 0.6)
 */
function computeRelevanceScore(
  playbook: IPlaybook,
  taskType: string,
  domain: string | null,
  dependencies: readonly string[],
): number {
  // Task type match
  let taskTypeScore: number;
  if (playbook.taskType === taskType) {
    taskTypeScore = 1.0;
  } else if (taskType.startsWith(playbook.taskType) || playbook.taskType.startsWith(extractDomainPrefix(taskType) ?? "")) {
    taskTypeScore = 0.5;
  } else if (playbook.level === "universal") {
    taskTypeScore = 0.3;
  } else {
    taskTypeScore = 0;
  }

  // Success rate (direct proportion)
  const successScore = playbook.successRate;

  // Tech stack match (Jaccard similarity)
  const techStackScore = jaccardSimilarity(
    new Set(dependencies.map(stripVersion)),
    new Set(playbook.validatedDependencies.map(stripVersion)),
  );

  // Freshness (exponential decay over 30 days)
  const freshnessScore = computeFreshness(playbook.lastValidatedAt, 30);

  // Level bonus
  const levelScore = levelBonus(playbook.level);

  return (
    taskTypeScore * 0.35 +
    successScore * 0.25 +
    techStackScore * 0.20 +
    freshnessScore * 0.10 +
    levelScore * 0.10
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function computeFreshness(
  lastValidated: Date | null,
  halfLifeDays: number,
): number {
  if (lastValidated === null) return 0.3; // Unknown freshness gets a low default
  const daysSinceValidation =
    (Date.now() - lastValidated.getTime()) / (1000 * 60 * 60 * 24);
  return Math.exp(-daysSinceValidation / halfLifeDays);
}

function levelBonus(level: PlaybookLevel): number {
  switch (level) {
    case "build":
      return 1.0;
    case "domain":
      return 0.8;
    case "universal":
      return 0.6;
  }
}

function stripVersion(dep: string): string {
  // "stripe@14.2.1" → "stripe"
  const atIndex = dep.indexOf("@");
  return atIndex > 0 ? dep.substring(0, atIndex) : dep;
}

function extractDomainPrefix(taskType: string): string | null {
  // "stripe_billing_next_app_router" → "stripe_billing"
  const parts = taskType.split("_");
  if (parts.length >= 2) {
    return parts.slice(0, 2).join("_");
  }
  return null;
}

// ---------------------------------------------------------------------------
// Formatting for golden window injection
// ---------------------------------------------------------------------------

/**
 * Format playbooks into a structured markdown block for injection into
 * the golden window's knowledge section.
 */
function formatPlaybooksForInjection(playbooks: readonly IPlaybook[]): string {
  const sections: string[] = [
    "## Playbooks (Proven Strategies)",
    "",
    "The following playbooks are synthesized from successful builds. " +
      "Use these as your primary implementation guide.",
    "",
  ];

  for (const pb of playbooks) {
    sections.push(formatSinglePlaybook(pb));
    sections.push("");
  }

  return sections.join("\n");
}

/**
 * Format a single playbook into structured markdown.
 */
function formatSinglePlaybook(playbook: IPlaybook): string {
  const lines: string[] = [];

  const levelLabel =
    playbook.level === "build"
      ? "Task-Specific"
      : playbook.level === "domain"
        ? "Domain Pattern"
        : "Universal Pattern";

  lines.push(
    `### ${levelLabel}: ${playbook.taskType} (${(playbook.successRate * 100).toFixed(0)}% success, ${playbook.evidenceCount} builds)`,
  );
  lines.push("");

  // Approach
  lines.push("**Approach:**");
  lines.push(playbook.approach);
  lines.push("");

  // Constraints (non-negotiable)
  if (playbook.constraints.length > 0) {
    lines.push("**Architectural Constraints (Non-Negotiable):**");
    for (const constraint of playbook.constraints) {
      lines.push(`- ${constraint}`);
    }
    lines.push("");
  }

  // Key decisions
  if (playbook.keyDecisions.length > 0) {
    lines.push("**Key Decisions:**");
    for (const decision of playbook.keyDecisions) {
      lines.push(
        `- ${decision.decision} — ${decision.reasoning} (confirmed ${decision.confirmations}x)`,
      );
    }
    lines.push("");
  }

  // Gotchas
  if (playbook.gotchas.length > 0) {
    lines.push("**Known Gotchas:**");
    for (const gotcha of playbook.gotchas) {
      lines.push(`- ${gotcha.situation} → ${gotcha.resolution}`);
    }
    lines.push("");
  }

  // Dependencies
  if (playbook.validatedDependencies.length > 0) {
    lines.push(
      `**Validated Dependencies:** ${playbook.validatedDependencies.join(", ")}`,
    );
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Deduplication helper
// ---------------------------------------------------------------------------

function deduplicateById(playbooks: readonly IPlaybook[]): IPlaybook[] {
  const seen = new Set<string>();
  const result: IPlaybook[] = [];
  for (const pb of playbooks) {
    if (!seen.has(pb.id)) {
      seen.add(pb.id);
      result.push(pb);
    }
  }
  return result;
}
