/**
 * ACE-style evolving playbook interfaces — the system for extracting,
 * evolving, and applying task-specific playbooks from accumulated build
 * experience.
 *
 * The ACE architecture maps to Cortex as:
 * - Generator  → PlaybookExtractor (extracts playbooks from build outcomes)
 * - Reflector  → PlaybookEvolver (evaluates strategies against outcomes)
 * - Curator    → PlaybookStore + PlaybookEvolver (organizes, prunes, retires)
 *
 * Playbooks exist at three levels:
 * - Build-level: strategies discovered during a single build
 * - Domain-level: strategies accumulated across builds in the same domain
 * - Universal: cross-domain patterns that apply broadly
 *
 * Spec Section 6.4 — ACE-Style Evolving Playbooks
 * Spec Section 6.3 — Experiential Trail System (playbooks build on trails)
 * Spec Section 6.7 — Model Tier Optimization via Routing (trail coverage
 *   density, which playbooks contribute to)
 */

import type { ITrailEntry, TrailOutcome } from "./knowledge.js";
import type { IViolationRecord } from "./violation.js";

// ---------------------------------------------------------------------------
// Playbook levels and status
// ---------------------------------------------------------------------------

/**
 * The three levels of playbook accumulation from Spec Section 6.4.
 *
 * - build: strategies discovered during a single build (e.g., "for this
 *   project's auth system, server-side sessions with Drizzle adapter works best")
 * - domain: strategies accumulated across builds in the same domain (e.g.,
 *   "SaaS apps with per-seat billing should use immediate proration")
 * - universal: cross-domain patterns (e.g., "async API polling needs progress
 *   indication, timeout handling, and graceful failure")
 */
export type PlaybookLevel = "build" | "domain" | "universal";

/**
 * Lifecycle status of a playbook.
 *
 * - active: currently used for golden window injection
 * - deprecated: hasn't been validated in recent builds, reduced injection weight
 * - retired: no longer injected, preserved for historical analysis
 * - merged: absorbed into another playbook via evolution
 */
export type PlaybookStatus = "active" | "deprecated" | "retired" | "merged";

// ---------------------------------------------------------------------------
// Core playbook type
// ---------------------------------------------------------------------------

/**
 * IPlaybook — a task-specific playbook with approach, constraints, and
 * success metrics.
 *
 * Playbooks are the evolved form of experiential trails. While trails capture
 * individual decisions, playbooks synthesize patterns across multiple trails
 * into reusable strategies. A playbook for "stripe_billing_next_app_router"
 * might encode: use server-side subscription state, handle webhooks outside
 * middleware chain, use Drizzle adapter for session management.
 *
 * Spec Section 6.4 — "Rather than static trail injection, the ACE pattern
 * treats contexts as evolving playbooks that accumulate and refine strategies
 * over time."
 */
export interface IPlaybook {
  /** Unique playbook identifier. */
  readonly id: string;

  /**
   * Task type this playbook targets (e.g., "stripe_billing_next_app_router").
   * For domain-level playbooks, this is a broader category (e.g., "saas_billing").
   * For universal playbooks, this is a cross-cutting concern (e.g., "async_api_polling").
   */
  readonly taskType: string;

  /** Playbook accumulation level per Spec Section 6.4. */
  readonly level: PlaybookLevel;

  /** Lifecycle status. */
  readonly status: PlaybookStatus;

  /**
   * The synthesized approach — what to do and how to do it.
   * Phrased as positive guidance, never as warnings or prohibitions.
   * This is the core content injected into golden windows.
   */
  readonly approach: string;

  /**
   * Architectural constraints derived from violation trails.
   * Each constraint is phrased as a non-negotiable requirement.
   * Spec Section 6.3 — "non-negotiable framing."
   */
  readonly constraints: readonly string[];

  /**
   * Key decisions with reasoning — the "why" behind the approach.
   * Helps agents understand trade-offs rather than blindly following patterns.
   */
  readonly keyDecisions: readonly IPlaybookDecision[];

  /**
   * Known gotchas — pitfalls encountered in past builds.
   * Each gotcha includes the resolution, phrased as what to do (not what to avoid).
   */
  readonly gotchas: readonly IPlaybookGotcha[];

  /**
   * Dependencies and versions this playbook was validated against.
   * Used for tech stack matching during selection.
   */
  readonly validatedDependencies: readonly string[];

  // --- Metrics ---

  /** Number of builds that contributed evidence to this playbook. */
  readonly evidenceCount: number;

  /**
   * Success rate: ratio of builds using this playbook's approach that passed
   * first-pass verification (0-1).
   */
  readonly successRate: number;

  /**
   * Average evaluator score across builds that used this playbook's patterns (0-1).
   */
  readonly averageEvaluatorScore: number;

  /** Trail IDs that contributed to this playbook. */
  readonly sourceTrailIds: readonly string[];

  /** IDs of playbooks this was merged from (if status is active after merge). */
  readonly mergedFromIds: readonly string[];

  /** ID of the playbook this was merged into (if status is "merged"). */
  readonly mergedIntoId: string | null;

  // --- Timestamps ---

  /** When this playbook was first created. */
  readonly createdAt: Date;

  /** When this playbook was last updated (approach, constraints, or metrics). */
  readonly updatedAt: Date;

  /**
   * When this playbook was last validated in a real build.
   * Playbooks that haven't been validated recently are deprecated.
   * Mirrors the trail freshness pattern from Spec Section 3.2.
   */
  readonly lastValidatedAt: Date | null;
}

/**
 * A key decision recorded in a playbook — captures the "why" behind
 * an architectural choice so agents can adapt rather than blindly follow.
 */
export interface IPlaybookDecision {
  /** What was decided. */
  readonly decision: string;
  /** Why this decision was made. */
  readonly reasoning: string;
  /** How many builds confirmed this decision. */
  readonly confirmations: number;
}

/**
 * A known gotcha — a pitfall encountered in past builds with its resolution.
 * Phrased as positive guidance: "what to do" rather than "what to avoid."
 */
export interface IPlaybookGotcha {
  /** The situation that triggers this gotcha. */
  readonly situation: string;
  /** The resolution — what to do (positive framing). */
  readonly resolution: string;
  /** How many builds encountered this gotcha. */
  readonly occurrences: number;
}

// ---------------------------------------------------------------------------
// Playbook evolution tracking
// ---------------------------------------------------------------------------

/**
 * The type of evolution that occurred to a playbook.
 */
export type PlaybookEvolutionType =
  | "created"         // Initial extraction from trails
  | "reinforced"      // Existing approach confirmed by new evidence
  | "refined"         // Approach updated with new details/gotchas
  | "merged"          // Two playbooks combined into one
  | "deprecated"      // Moved to deprecated status (stale)
  | "retired"         // Moved to retired status (replaced or obsolete)
  | "reactivated";    // Deprecated playbook validated again and reactivated

/**
 * IPlaybookEvolutionRecord — tracks how a playbook has changed over time.
 *
 * Evolution records provide auditability and allow the system to understand
 * the trajectory of its own knowledge. The Curator role uses evolution
 * history to make deprecation and retirement decisions.
 *
 * Spec Section 6.4 — the ACE Curator "organizes and prunes the playbook."
 */
export interface IPlaybookEvolutionRecord {
  /** Unique evolution record identifier. */
  readonly id: string;
  /** The playbook this evolution applies to. */
  readonly playbookId: string;
  /** What type of evolution occurred. */
  readonly evolutionType: PlaybookEvolutionType;

  /** Description of what changed. */
  readonly description: string;

  /** The build that triggered this evolution (null for system maintenance). */
  readonly triggeringBuildId: string | null;
  /** Trail IDs that provided evidence for this evolution. */
  readonly evidenceTrailIds: readonly string[];

  /** Playbook state before the evolution (snapshot of key fields). */
  readonly before: IPlaybookSnapshot | null;
  /** Playbook state after the evolution. */
  readonly after: IPlaybookSnapshot;

  /** When this evolution was recorded. */
  readonly evolvedAt: Date;
}

/**
 * A snapshot of playbook state at a point in time, used in evolution records
 * to track what changed.
 */
export interface IPlaybookSnapshot {
  readonly approach: string;
  readonly constraints: readonly string[];
  readonly successRate: number;
  readonly evidenceCount: number;
  readonly status: PlaybookStatus;
}

// ---------------------------------------------------------------------------
// Build outcome (input to playbook extraction)
// ---------------------------------------------------------------------------

/**
 * IBuildOutcome — the outcome of a completed build, used by the Playbook
 * Extractor to synthesize new playbooks or provide evidence for existing ones.
 *
 * This is the Reflector input in ACE terminology — the measured outcome
 * that the system uses to evaluate strategies.
 *
 * Spec Section 6.4 — "the CVS measures outcomes (Reflector)."
 */
export interface IBuildOutcome {
  /** The build ID. */
  readonly buildId: string;
  /** Task type classification for this build's primary goal. */
  readonly taskType: string;
  /** Domain classification (e.g., "saas", "e-commerce", "content-management"). */
  readonly domain: string | null;
  /** Trails produced during this build. */
  readonly trails: readonly ITrailEntry[];
  /** Violation records from this build. */
  readonly violations: readonly IViolationRecord[];
  /** Overall build outcome. */
  readonly outcome: TrailOutcome;
  /** Overall evaluator score for the build (0-1). */
  readonly evaluatorScore: number | null;
  /** Dependencies used across all agents in this build. */
  readonly dependencies: readonly string[];
}

// ---------------------------------------------------------------------------
// Playbook extraction (Generator role)
// ---------------------------------------------------------------------------

/**
 * IPlaybookExtraction — the result of extracting playbooks from a build outcome.
 * Contains both new playbooks created and evidence for existing ones.
 */
export interface IPlaybookExtraction {
  /** Newly created playbooks from this build's patterns (IDs assigned by store). */
  readonly newPlaybooks: readonly Omit<IPlaybook, "id">[];
  /** Existing playbooks that received reinforcing evidence. */
  readonly reinforcedPlaybookIds: readonly string[];
  /** Existing playbooks that were refined with new details. */
  readonly refinedPlaybookIds: readonly string[];
  /** The build that produced this extraction. */
  readonly buildId: string;
}

/**
 * IPlaybookExtractor — analyzes completed builds and violation records to
 * extract reusable patterns as playbooks.
 *
 * This is the Generator in ACE terminology — it proposes strategies based
 * on observed build outcomes. The Extractor synthesizes trails into playbooks:
 * individual trail decisions become approach steps, gotchas become playbook
 * gotchas, violation trails become constraints.
 *
 * Spec Section 6.4 — "the Librarian generates trail entries (Generator)."
 */
export interface IPlaybookExtractor {
  /**
   * Extract playbooks from a completed build's outcome.
   *
   * The extractor:
   * 1. Groups trails by task type
   * 2. Checks for existing playbooks that match the task type
   * 3. If no existing playbook: creates a new build-level playbook
   * 4. If existing playbook: provides reinforcement or refinement evidence
   * 5. Extracts constraints from violation records
   * 6. Synthesizes gotchas from dead-end and violation trails
   *
   * @param outcome — the completed build's outcome
   * @param existingPlaybooks — current playbooks for matching task types
   */
  extract(
    outcome: IBuildOutcome,
    existingPlaybooks: readonly IPlaybook[],
  ): IPlaybookExtraction;
}

// ---------------------------------------------------------------------------
// Playbook evolution (Curator role)
// ---------------------------------------------------------------------------

/**
 * IPlaybookEvolver — merges, refines, and retires playbooks as evidence
 * accumulates across builds.
 *
 * This is the Curator in ACE terminology — it "organizes and prunes the
 * playbook." The Evolver handles:
 * - Promoting build-level playbooks to domain-level when enough evidence exists
 * - Merging overlapping playbooks for the same task type
 * - Deprecating playbooks that haven't been validated recently
 * - Retiring playbooks that have been superseded or are consistently failing
 * - Reactivating deprecated playbooks if new evidence validates them
 *
 * Spec Section 6.4 — "the knowledge base management logic organizes and
 * depreciates stale entries (Curator)."
 */
export interface IPlaybookEvolver {
  /**
   * Evolve playbooks after new evidence from a build extraction.
   *
   * This is the primary evolution entry point, called after each build.
   * Returns evolution records describing what changed.
   *
   * @param extraction — the extraction result from PlaybookExtractor
   * @param allPlaybooks — the full playbook inventory for the affected task types
   */
  evolve(
    extraction: IPlaybookExtraction,
    allPlaybooks: readonly IPlaybook[],
  ): readonly IPlaybookEvolutionRecord[];

  /**
   * Merge two overlapping playbooks into one.
   * The merged playbook retains the best approach, combines constraints and
   * gotchas, and aggregates metrics. Both source playbooks are marked "merged."
   *
   * @param playbookA — first playbook to merge
   * @param playbookB — second playbook to merge
   */
  merge(
    playbookA: IPlaybook,
    playbookB: IPlaybook,
  ): { merged: IPlaybook; evolution: IPlaybookEvolutionRecord };

  /**
   * Run deprecation sweep — check all active playbooks and deprecate those
   * that haven't been validated within the staleness threshold.
   *
   * Mirrors the Librarian's trail freshness tracking from Spec Section 3.2.
   *
   * @param playbooks — all active playbooks to check
   * @param stalenessThresholdMs — how long since last validation before deprecation
   */
  sweepStale(
    playbooks: readonly IPlaybook[],
    stalenessThresholdMs: number,
  ): readonly IPlaybookEvolutionRecord[];

  /**
   * Promote a build-level playbook to domain-level when sufficient cross-build
   * evidence exists.
   *
   * Spec Section 6.4 — "Domain-level playbooks accumulate strategies across
   * builds in the same domain."
   *
   * @param playbook — the build-level playbook to evaluate
   * @param minEvidence — minimum evidence count for promotion (default: 5)
   * @param minSuccessRate — minimum success rate for promotion (default: 0.8)
   */
  evaluatePromotion(
    playbook: IPlaybook,
    minEvidence?: number,
    minSuccessRate?: number,
  ): IPlaybookEvolutionRecord | null;
}

// ---------------------------------------------------------------------------
// Playbook application (golden window injection)
// ---------------------------------------------------------------------------

/**
 * IPlaybookSelection — the result of selecting playbooks for an agent's
 * golden window.
 */
export interface IPlaybookSelection {
  /** Selected playbooks ordered by relevance (most relevant first). */
  readonly playbooks: readonly IPlaybook[];
  /** Formatted content ready for golden window injection. */
  readonly formattedContent: string;
  /** Estimated token count for the formatted content. */
  readonly tokenEstimate: number;
  /** Selection reasoning for diagnostics. */
  readonly selectionReasoning: readonly string[];
}

/**
 * IPlaybookApplicator — selects and injects relevant playbooks into agent
 * golden windows during goal assignment.
 *
 * The Applicator is the bridge between the knowledge base and agent context.
 * It selects the most relevant playbooks for a given goal and formats them
 * for injection into the golden window's trail section.
 *
 * Playbook injection supplements (not replaces) trail injection. Playbooks
 * provide synthesized strategies; trails provide specific examples. Together
 * they give agents both the "what to do" and "how others did it."
 *
 * Spec Section 6.4 — playbooks injected into golden windows
 * Spec Section 6.3 — "The top 3-7 trails are injected, consuming
 * approximately 2,000-5,000 tokens of the golden window."
 */
export interface IPlaybookApplicator {
  /**
   * Select and format playbooks for a goal assignment.
   *
   * Selection criteria:
   * 1. Task type match — exact match ranks highest
   * 2. Domain match — same domain ranks higher for domain-level playbooks
   * 3. Tech stack match — playbooks validated against same dependencies rank higher
   * 4. Success rate — higher success rate ranks higher
   * 5. Freshness — recently validated playbooks rank higher
   * 6. Level — domain and universal playbooks supplement build-level ones
   *
   * @param taskType — the task type for the goal being assigned
   * @param domain — optional domain classification
   * @param dependencies — dependencies the goal will use
   * @param maxTokens — token budget for playbook content (default: 3000)
   * @param maxPlaybooks — maximum number of playbooks to inject (default: 3)
   */
  select(
    taskType: string,
    domain: string | null,
    dependencies: readonly string[],
    maxTokens?: number,
    maxPlaybooks?: number,
  ): Promise<IPlaybookSelection>;
}

// ---------------------------------------------------------------------------
// Playbook store (persistence)
// ---------------------------------------------------------------------------

/**
 * Query parameters for retrieving playbooks from the store.
 */
export interface IPlaybookQuery {
  /** Filter by task type (exact match). */
  readonly taskType?: string;
  /** Filter by task type prefix (for domain-level matching). */
  readonly taskTypePrefix?: string;
  /** Filter by level. */
  readonly level?: PlaybookLevel;
  /** Filter by status. */
  readonly status?: PlaybookStatus;
  /** Only playbooks validated after this date. */
  readonly validatedAfter?: Date;
  /** Minimum success rate. */
  readonly minSuccessRate?: number;
  /** Minimum evidence count. */
  readonly minEvidence?: number;
  /** Maximum number of results. */
  readonly limit?: number;
  /** Order by field. */
  readonly orderBy?: "successRate" | "evidenceCount" | "updatedAt" | "lastValidatedAt";
  /** Order direction. */
  readonly orderDirection?: "asc" | "desc";
}

/**
 * IPlaybookStore — persistence layer for playbooks and their evolution history.
 *
 * Stores playbooks with full metadata, supports structured queries for
 * retrieval, and maintains the evolution audit trail.
 *
 * Spec Section 6.4 — playbooks persist across builds as part of the
 * knowledge base (Spec Section 6.6 Layer 5 — cross-build knowledge base).
 */
export interface IPlaybookStore {
  /** Initialize storage (create indexes, etc.). */
  initialize(): Promise<void>;

  /** Insert a new playbook. Returns the stored playbook with generated ID. */
  insert(playbook: Omit<IPlaybook, "id">): Promise<IPlaybook>;

  /** Update an existing playbook. Returns the updated playbook. */
  update(id: string, updates: Partial<Omit<IPlaybook, "id">>): Promise<IPlaybook>;

  /** Retrieve a playbook by ID. */
  getById(id: string): Promise<IPlaybook | null>;

  /** Query playbooks with structured filters. */
  query(params: IPlaybookQuery): Promise<readonly IPlaybook[]>;

  /** Count playbooks matching the given query. */
  count(params: IPlaybookQuery): Promise<number>;

  /**
   * Get all distinct task types with their playbook counts and best success rates.
   * Used for assessing playbook coverage density.
   */
  getTaskTypeCoverage(): Promise<ReadonlyMap<string, { count: number; bestSuccessRate: number }>>;

  /** Mark a playbook as validated in a build. */
  markValidated(playbookId: string, validatedAt: Date): Promise<void>;

  // --- Evolution history ---

  /** Record a playbook evolution event. */
  recordEvolution(record: Omit<IPlaybookEvolutionRecord, "id">): Promise<IPlaybookEvolutionRecord>;

  /** Get the evolution history for a playbook. */
  getEvolutionHistory(playbookId: string): Promise<readonly IPlaybookEvolutionRecord[]>;

  /** Close storage. */
  close(): Promise<void>;
}
