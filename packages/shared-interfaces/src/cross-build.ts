/**
 * Cross-build pattern analysis and domain playbook interfaces — the system
 * that identifies recurring patterns across builds, classifies builds by
 * domain, curates domain-specific knowledge, and tracks knowledge compounding.
 *
 * Cross-build patterns are the statistical backbone of Cortex's compounding
 * intelligence. While individual trails capture single-build decisions and
 * playbooks synthesize strategies, cross-build analysis detects emergent
 * patterns visible only at scale: failure rates, domain preferences,
 * technology affinities, and recurring architectural decisions.
 *
 * The domain system organizes this knowledge by application domain (e-commerce,
 * SaaS dashboard, content management, etc.) enabling domain-specific playbook
 * curation and targeted knowledge injection.
 *
 * Spec Section 1.2, Principle 5 — "Every build feeds data back. Experiential
 *   trails, telemetry, UX results, intent accuracy, and design scores compound.
 *   The knowledge base is the competitive moat — not the model."
 * Spec Section 2.3 — "After 1,000 builds, ICE doesn't just infer what users
 *   want — it KNOWS what users in specific domains want."
 * Spec Section 4.2 — Tier 1 Shared Services: "Knowledge Base (Librarian) —
 *   Experiential trails, anti-patterns, cross-build patterns — Permanent,
 *   cross-project."
 * Spec Section 6.3 — "Cross-build pattern trails — aggregated insights that
 *   only emerge across many builds."
 * Spec Section 6.4 — "Domain-level playbooks accumulate strategies across
 *   builds in the same domain."
 * Spec Section 6.6 Layer 5 — "Cross-build knowledge base — the Librarian's
 *   persistent store of trails, anti-patterns, violation records, and domain
 *   playbooks (Tier 1 shared service, permanent)."
 * Spec Section 6.7 — Trail coverage density feeds model tier routing.
 * Spec Section 12.4 — Phase D, Step 21: "Cross-build pattern analysis and
 *   domain playbooks."
 */

import type { ITrailEntry, TrailOutcome } from "./knowledge.js";
import type { IPlaybook, IBuildOutcome, PlaybookLevel } from "./playbooks.js";
import type { IAntiPattern } from "./anti-patterns.js";

// ---------------------------------------------------------------------------
// Domain classification
// ---------------------------------------------------------------------------

/**
 * Known application domains that Cortex recognizes and accumulates
 * domain-specific knowledge for.
 *
 * The domain taxonomy starts with broad categories. As the knowledge base
 * grows, subdomains emerge (e.g., "saas:billing", "e-commerce:marketplace").
 * The classifier handles both known and novel domains.
 *
 * Spec Section 2.2 Stage 1 — "Domain inference — what does this domain
 *   universally require?"
 * Spec Section 2.3 — "ICE KNOWS what users in specific domains want."
 * Spec Section 6.4 — "Domain-level playbooks accumulate strategies across
 *   builds in the same domain."
 */
export type KnownDomain =
  | "saas"                   // SaaS applications (billing, multi-tenant, subscriptions)
  | "e-commerce"             // Online stores (products, carts, checkout, payments)
  | "content-management"     // CMS, blogs, documentation sites
  | "dashboard"              // Analytics, admin panels, data visualization
  | "social"                 // Social platforms (feeds, profiles, messaging)
  | "marketplace"            // Two-sided marketplaces (listings, transactions, reviews)
  | "developer-tools"        // APIs, SDKs, developer portals, documentation
  | "productivity"           // Task management, collaboration, workflow tools
  | "media"                  // Video, audio, image processing/streaming
  | "ai-powered"             // AI-integrated apps (chat, generation, analysis)
  | "portfolio"              // Personal/business portfolio and landing pages
  | "internal-tools";        // Internal business tools and admin systems

/**
 * IDomainClassification — the result of classifying a build into a domain.
 *
 * Classification is probabilistic — a build may exhibit traits of multiple
 * domains. The primary domain drives playbook selection; secondary domains
 * provide supplementary knowledge.
 *
 * Spec Section 2.2, Stage 4, Method 1 — "Domain inference — what does this
 *   domain universally require?"
 */
export interface IDomainClassification {
  /**
   * Primary domain — the best-matching known domain.
   * Null if the build doesn't match any known domain well enough
   * (confidence below threshold).
   */
  readonly primaryDomain: KnownDomain | null;

  /**
   * Confidence in the primary classification (0-1).
   * Based on signal match strength from prompt analysis and feature inventory.
   */
  readonly primaryConfidence: number;

  /**
   * Secondary domains with their confidence scores.
   * Ordered by confidence (descending). Only includes domains above 0.2.
   * Example: a project management SaaS might classify as primary "saas"
   * with secondary ["productivity", "dashboard"].
   */
  readonly secondaryDomains: readonly IDomainScore[];

  /**
   * Custom domain label for builds that don't fit known categories.
   * Inferred from the prompt and feature set when no known domain matches.
   * Example: "healthcare-scheduling", "real-estate-platform".
   */
  readonly customDomain: string | null;

  /**
   * The signals that contributed to this classification.
   * Used for diagnostics and to improve the classifier over time.
   */
  readonly signals: readonly IDomainSignal[];

  /**
   * The effective domain string used for knowledge retrieval.
   * This is primaryDomain if confident, customDomain if not, or null
   * if classification is entirely uncertain.
   */
  readonly effectiveDomain: string | null;
}

/**
 * A domain with its classification confidence score.
 */
export interface IDomainScore {
  readonly domain: KnownDomain;
  readonly confidence: number;
}

/**
 * A signal that contributed to domain classification.
 * Captures what evidence led to a particular domain assignment.
 */
export interface IDomainSignal {
  /** The type of signal (keyword, feature, dependency, prompt-pattern). */
  readonly signalType: DomainSignalType;
  /** The specific evidence (e.g., "billing", "stripe", "shopping cart"). */
  readonly evidence: string;
  /** Which domain this signal supports. */
  readonly supportsDomain: string;
  /** How much weight this signal carries (0-1). */
  readonly weight: number;
}

/**
 * Types of signals used for domain classification.
 *
 * Spec Section 2.2 Stage 1 — the Decoupler analyzes prompts for domain cues.
 * Spec Section 2.2 Stage 3 — technical constraints reveal domain-specific
 *   patterns (e.g., payment APIs → e-commerce).
 */
export type DomainSignalType =
  | "keyword"            // Domain keywords in the prompt (e.g., "billing", "checkout")
  | "feature"            // Feature names that imply domain (e.g., "shopping cart")
  | "dependency"         // Dependencies that signal domain (e.g., "stripe" → e-commerce)
  | "prompt-pattern"     // Structural patterns in how the user describes the app
  | "historical-match";  // Match against previously classified builds

// ---------------------------------------------------------------------------
// Cross-build pattern analysis
// ---------------------------------------------------------------------------

/**
 * ICrossBuildPattern — a pattern detected across multiple builds.
 *
 * Cross-build patterns emerge from statistical analysis of trail data across
 * many builds. They represent insights that no single build could produce:
 * failure rates, technology affinities, architectural preferences, and
 * timing patterns.
 *
 * Spec Section 6.3 — "Cross-build pattern trails — aggregated insights
 *   that only emerge across many builds: 'Async API polling fails to
 *   implement timeout handling 65% of the time on first pass.'"
 *
 * Spec Section 1.2, Principle 5 — "After 10,000 builds, a new entrant
 *   would need to replicate not just the architecture but the accumulated
 *   knowledge of 10,000 real projects."
 */
export interface ICrossBuildPattern {
  /** Unique pattern identifier. */
  readonly id: string;

  /**
   * Pattern category — what kind of cross-build insight this represents.
   */
  readonly category: CrossBuildPatternCategory;

  /**
   * Task types this pattern applies to.
   * Patterns may span multiple related task types.
   */
  readonly taskTypes: readonly string[];

  /**
   * Domain this pattern was observed in (null for cross-domain patterns).
   */
  readonly domain: string | null;

  /**
   * Human-readable description of the pattern.
   * Example: "Next.js App Router builds with Stripe integration require
   * server-side API route for webhook handling in 94% of successful builds."
   */
  readonly description: string;

  /**
   * Statistical evidence supporting this pattern.
   */
  readonly statistics: ICrossBuildStatistics;

  /**
   * Build IDs that contributed to this pattern's detection.
   */
  readonly sourceBuildIds: readonly string[];

  /**
   * Trail IDs that provided evidence for this pattern.
   */
  readonly sourceTrailIds: readonly string[];

  /** When this pattern was first detected. */
  readonly detectedAt: Date;

  /** When this pattern was last confirmed by new build data. */
  readonly lastConfirmedAt: Date | null;

  /**
   * Whether this pattern has been promoted to a trail entry.
   * Cross-build patterns become "cross-build" type trail entries
   * once they have sufficient evidence.
   *
   * Spec Section 6.3 — cross-build trails are one of the five trail types.
   */
  readonly promotedToTrailId: string | null;
}

/**
 * Categories of cross-build patterns.
 *
 * Spec Section 2.3 — the learning flywheel captures multiple signal types:
 *   intent accuracy, competitive intelligence, technical constraints,
 *   anti-patterns.
 */
export type CrossBuildPatternCategory =
  | "failure-rate"         // Task type fails at a specific rate on first pass
  | "tech-affinity"        // Certain technologies co-occur in successful builds
  | "architectural-pref"   // Architectural choices that correlate with success
  | "timing-pattern"       // Build phases that take disproportionately long
  | "dependency-pattern"   // Dependency combinations that cause issues
  | "domain-insight";      // Domain-specific knowledge emerging from builds

/**
 * Statistical evidence for a cross-build pattern.
 */
export interface ICrossBuildStatistics {
  /** Total number of builds analyzed. */
  readonly totalBuilds: number;

  /** Number of builds where this pattern was observed. */
  readonly observedInBuilds: number;

  /**
   * Rate at which this pattern occurs (observedInBuilds / totalBuilds).
   * For failure-rate patterns, this is the failure rate.
   * For tech-affinity patterns, this is the co-occurrence rate.
   */
  readonly rate: number;

  /**
   * Average evaluator score for builds exhibiting this pattern.
   * Null if evaluator scores aren't available for enough builds.
   */
  readonly averageScore: number | null;

  /**
   * Statistical significance — is this pattern real or noise?
   * Based on sample size relative to total builds.
   * Low: < 10 observations. Medium: 10-49. High: 50+.
   */
  readonly significance: "low" | "medium" | "high";

  /**
   * Trend direction — is this pattern becoming more or less common?
   * Based on comparison of recent builds vs. older builds.
   */
  readonly trend: "increasing" | "stable" | "decreasing";
}

// ---------------------------------------------------------------------------
// Cross-build pattern analyzer
// ---------------------------------------------------------------------------

/**
 * ICrossBuildPatternAnalyzer — detects recurring patterns across builds
 * by analyzing accumulated trail data.
 *
 * This is the engine that turns individual trail entries into cross-build
 * insights. It runs periodically (or after each build) and produces
 * ICrossBuildPattern entries for patterns that exceed statistical thresholds.
 *
 * When a cross-build pattern has sufficient evidence, it is promoted to a
 * "cross-build" type trail entry that gets injected into future agents'
 * golden windows alongside regular trails.
 *
 * Spec Section 6.3 — "Cross-build pattern trails — aggregated insights
 *   that only emerge across many builds."
 * Spec Section 2.3 — "After 1,000 builds, ICE... KNOWS what mistakes
 *   to avoid."
 * Spec Section 9.2, Step 1 — "Trail Extraction — the Librarian extracts
 *   all valuable data."
 */
export interface ICrossBuildPatternAnalyzer {
  /**
   * Analyze all accumulated trails to detect cross-build patterns.
   *
   * Groups trails by task type and domain, computes statistics,
   * identifies patterns exceeding thresholds, and returns new and
   * updated patterns.
   *
   * @param trails — all trails to analyze (typically full trail store)
   * @param existingPatterns — current known patterns (for deduplication)
   */
  analyzeAll(
    trails: readonly ITrailEntry[],
    existingPatterns: readonly ICrossBuildPattern[],
  ): ICrossBuildAnalysisResult;

  /**
   * Analyze trails from a single completed build for incremental
   * pattern detection.
   *
   * More efficient than analyzeAll — only considers new evidence from
   * the latest build against existing pattern baselines.
   *
   * @param buildOutcome — the completed build's outcome
   * @param existingPatterns — current known patterns
   */
  analyzeIncremental(
    buildOutcome: IBuildOutcome,
    existingPatterns: readonly ICrossBuildPattern[],
  ): ICrossBuildAnalysisResult;

  /**
   * Promote a cross-build pattern to a trail entry.
   *
   * Creates a "cross-build" type ITrailEntry from the pattern's
   * accumulated evidence. This trail entry gets injected into
   * future agents' golden windows alongside implementation trails.
   *
   * Spec Section 6.3 — cross-build is one of the five trail types.
   *
   * @param pattern — the pattern to promote
   */
  promoteToTrail(
    pattern: ICrossBuildPattern,
  ): Omit<ITrailEntry, "id">;
}

/**
 * Result of a cross-build pattern analysis run.
 */
export interface ICrossBuildAnalysisResult {
  /** Newly detected patterns. */
  readonly newPatterns: readonly Omit<ICrossBuildPattern, "id">[];

  /** Existing pattern IDs that were confirmed with new evidence. */
  readonly confirmedPatternIds: readonly string[];

  /** Existing pattern IDs whose statistics were significantly updated. */
  readonly updatedPatternIds: readonly string[];

  /** Patterns ready for promotion to trail entries (high significance). */
  readonly promotionCandidates: readonly string[];

  /** Total builds analyzed in this run. */
  readonly buildsAnalyzed: number;

  /** Total trails analyzed in this run. */
  readonly trailsAnalyzed: number;

  /** When this analysis was performed. */
  readonly analyzedAt: Date;
}

// ---------------------------------------------------------------------------
// Cross-build pattern store
// ---------------------------------------------------------------------------

/**
 * Query parameters for retrieving cross-build patterns.
 */
export interface ICrossBuildPatternQuery {
  /** Filter by category. */
  readonly category?: CrossBuildPatternCategory;
  /** Filter by task type (matches if any of the pattern's taskTypes match). */
  readonly taskType?: string;
  /** Filter by domain. */
  readonly domain?: string;
  /** Filter by minimum significance. */
  readonly minSignificance?: "low" | "medium" | "high";
  /** Only patterns with at least this many observed builds. */
  readonly minObservations?: number;
  /** Only patterns detected after this date. */
  readonly detectedAfter?: Date;
  /** Maximum number of results. */
  readonly limit?: number;
}

/**
 * ICrossBuildPatternStore — persistent storage for cross-build patterns.
 *
 * Spec Section 6.6 Layer 5 — "Cross-build knowledge base — the Librarian's
 *   persistent store of trails, anti-patterns, violation records, and domain
 *   playbooks."
 */
export interface ICrossBuildPatternStore {
  /** Insert a new pattern. Returns the stored pattern with generated ID. */
  insert(pattern: Omit<ICrossBuildPattern, "id">): ICrossBuildPattern;

  /** Retrieve a pattern by ID. */
  getById(id: string): ICrossBuildPattern | null;

  /** Query patterns with structured filters. */
  query(params: ICrossBuildPatternQuery): readonly ICrossBuildPattern[];

  /** Get all patterns. */
  getAll(): readonly ICrossBuildPattern[];

  /**
   * Update an existing pattern's statistics, confirmation, or promotion status.
   */
  update(id: string, updates: Partial<Pick<ICrossBuildPattern,
    | "statistics"
    | "lastConfirmedAt"
    | "promotedToTrailId"
    | "sourceBuildIds"
    | "sourceTrailIds"
  >>): ICrossBuildPattern | null;

  /** Count patterns matching the query (or all if no query). */
  count(params?: ICrossBuildPatternQuery): number;
}

// ---------------------------------------------------------------------------
// Domain classifier
// ---------------------------------------------------------------------------

/**
 * IDomainClassifier — classifies builds into application domains based
 * on prompt analysis, feature inventory, and dependency analysis.
 *
 * The classifier is used at two points:
 * 1. During ICE processing — to tag builds with domain for knowledge routing
 * 2. Post-build — to refine classification based on actual implementation
 *
 * As the knowledge base grows, historical classifications feed back into
 * the classifier to improve accuracy. Novel domains are detected and named
 * automatically.
 *
 * Spec Section 2.2, Stage 4, Method 1 — "Domain inference — what does this
 *   domain universally require?"
 * Spec Section 2.3 — "After 1,000 builds, ICE... KNOWS what users in
 *   specific domains want."
 */
export interface IDomainClassifier {
  /**
   * Classify a build based on its prompt, features, and dependencies.
   *
   * @param prompt — the user's original build prompt
   * @param features — feature names from the living specification
   * @param dependencies — dependency names from the specification
   */
  classify(
    prompt: string,
    features: readonly string[],
    dependencies: readonly string[],
  ): IDomainClassification;

  /**
   * Refine a classification after the build completes, using actual
   * implementation data (files created, APIs integrated, etc.).
   *
   * @param initial — the initial classification from prompt analysis
   * @param buildOutcome — the completed build's outcome
   */
  refine(
    initial: IDomainClassification,
    buildOutcome: IBuildOutcome,
  ): IDomainClassification;

  /**
   * Get the current domain taxonomy — all known domains with their
   * build counts and associated task types.
   */
  getTaxonomy(): IDomainTaxonomy;
}

/**
 * The domain taxonomy — all known domains with their statistics.
 */
export interface IDomainTaxonomy {
  /** Known domains with their build counts. */
  readonly domains: ReadonlyMap<string, IDomainStats>;

  /** Total builds classified. */
  readonly totalClassified: number;

  /** Builds that couldn't be classified into any domain. */
  readonly unclassifiedCount: number;
}

/**
 * Statistics for a single domain in the taxonomy.
 */
export interface IDomainStats {
  /** Number of builds classified into this domain. */
  readonly buildCount: number;

  /** Most common task types for builds in this domain. */
  readonly topTaskTypes: readonly string[];

  /** Most common dependencies for builds in this domain. */
  readonly topDependencies: readonly string[];

  /** Average evaluator score for builds in this domain (0-1, null if unknown). */
  readonly averageScore: number | null;

  /** Number of domain-level playbooks available. */
  readonly playbookCount: number;
}

// ---------------------------------------------------------------------------
// Domain knowledge curator
// ---------------------------------------------------------------------------

/**
 * IDomainKnowledgeCurator — organizes accumulated knowledge by domain,
 * maintains domain-specific playbooks, and identifies cross-domain patterns.
 *
 * The curator sits between the Playbook system (Step 18) and the domain
 * classifier, ensuring that domain-level playbooks are properly curated
 * as builds accumulate within each domain.
 *
 * Spec Section 6.4 — "Domain-level playbooks accumulate strategies across
 *   builds in the same domain (e.g., 'SaaS apps with per-seat billing
 *   should use immediate proration')."
 *
 * Spec Section 6.6 Layer 5 — "Cross-build knowledge base — the Librarian's
 *   persistent store of trails, anti-patterns, violation records, and domain
 *   playbooks."
 *
 * Spec Section 2.3 — the learning flywheel: "competitive intelligence
 *   freshness — design briefs cached per domain with timestamps."
 */
export interface IDomainKnowledgeCurator {
  /**
   * Process a completed build's contribution to domain knowledge.
   *
   * After a build completes:
   * 1. Classifies the build into a domain (or refines existing classification)
   * 2. Routes the build's trails and playbooks to the appropriate domain
   * 3. Evaluates whether any build-level playbooks should be promoted
   *    to domain-level based on accumulated cross-build evidence
   * 4. Identifies cross-domain patterns emerging from the data
   *
   * @param buildOutcome — the completed build's outcome
   * @param classification — the build's domain classification
   * @param buildPlaybooks — playbooks extracted from this build
   */
  processBuildContribution(
    buildOutcome: IBuildOutcome,
    classification: IDomainClassification,
    buildPlaybooks: readonly IPlaybook[],
  ): IDomainCurationResult;

  /**
   * Get domain knowledge summary — playbooks, patterns, and statistics
   * for a specific domain.
   *
   * Used during ICE processing to inject domain-specific knowledge and
   * during golden window formation for domain-relevant playbook selection.
   *
   * @param domain — the domain to query
   */
  getDomainKnowledge(domain: string): IDomainKnowledge;

  /**
   * Identify build-level playbooks that are candidates for promotion
   * to domain-level based on cross-build evidence.
   *
   * Spec Section 6.4 — domain playbooks emerge from build-level patterns.
   *
   * @param domain — the domain to evaluate
   * @param minBuilds — minimum builds before considering promotion (default: 5)
   * @param minSuccessRate — minimum success rate for promotion (default: 0.8)
   */
  identifyPromotionCandidates(
    domain: string,
    minBuilds?: number,
    minSuccessRate?: number,
  ): readonly IPlaybook[];

  /**
   * Identify patterns that span multiple domains — candidates for
   * universal playbooks.
   *
   * Spec Section 6.4 — "Universal playbooks capture cross-domain patterns
   *   (e.g., 'async API polling needs progress indication, timeout handling,
   *   and graceful failure')."
   *
   * @param minDomains — minimum domains a pattern must appear in (default: 3)
   */
  identifyUniversalCandidates(
    minDomains?: number,
  ): readonly ICrossDomainCandidate[];
}

/**
 * Result of processing a build's contribution to domain knowledge.
 */
export interface IDomainCurationResult {
  /** The domain classification used. */
  readonly classification: IDomainClassification;

  /** Playbooks promoted from build-level to domain-level. */
  readonly promotedPlaybookIds: readonly string[];

  /** New cross-build patterns detected. */
  readonly newPatterns: readonly Omit<ICrossBuildPattern, "id">[];

  /** Domain knowledge stats after this contribution. */
  readonly domainStats: IDomainStats;

  /** Whether this build revealed a new (previously unseen) domain. */
  readonly isNewDomain: boolean;
}

/**
 * Domain knowledge summary — everything known about a specific domain.
 */
export interface IDomainKnowledge {
  /** The domain identifier. */
  readonly domain: string;

  /** Domain-level playbooks available. */
  readonly playbooks: readonly IPlaybook[];

  /** Cross-build patterns specific to this domain. */
  readonly patterns: readonly ICrossBuildPattern[];

  /** Anti-patterns common in this domain. */
  readonly antiPatterns: readonly IAntiPattern[];

  /** Common task types for this domain. */
  readonly commonTaskTypes: readonly string[];

  /** Common dependencies for this domain. */
  readonly commonDependencies: readonly string[];

  /** Domain statistics. */
  readonly stats: IDomainStats;
}

/**
 * A candidate for universal playbook promotion — a pattern found
 * across multiple domains.
 */
export interface ICrossDomainCandidate {
  /** Task type or pattern description. */
  readonly taskType: string;

  /** Domains where this pattern appears. */
  readonly domains: readonly string[];

  /** Combined evidence count across all domains. */
  readonly totalEvidence: number;

  /** Combined success rate across all domains. */
  readonly combinedSuccessRate: number;

  /** The build-level playbooks that share this pattern. */
  readonly sourcePlaybookIds: readonly string[];
}

// ---------------------------------------------------------------------------
// Knowledge compounding metrics
// ---------------------------------------------------------------------------

/**
 * IKnowledgeCompoundingMetrics — tracks the growth and effectiveness
 * of the knowledge base across builds.
 *
 * This is the "competitive moat" measurement — quantifying how much
 * better the system gets with each build.
 *
 * Spec Section 1.2, Principle 5 — "The knowledge base is the competitive
 *   moat — not the model."
 * Spec Section 6.7 — trail coverage density drives routing decisions.
 * Spec Section 2.3 — "After 1,000 builds, ICE doesn't just infer what
 *   users want — it KNOWS."
 */
export interface IKnowledgeCompoundingMetrics {
  /**
   * Record a build's contribution to the knowledge base.
   *
   * Called after each build completes, captures the incremental
   * knowledge added by this build.
   *
   * @param buildId — the completed build's ID
   * @param contribution — what this build contributed
   */
  recordBuildContribution(
    buildId: string,
    contribution: IBuildKnowledgeContribution,
  ): void;

  /**
   * Get the current knowledge base health snapshot.
   *
   * Returns comprehensive metrics about the knowledge base's
   * size, coverage, quality, and growth trajectory.
   */
  getHealthSnapshot(): IKnowledgeHealthSnapshot;

  /**
   * Get the compounding trajectory — how knowledge has grown over time.
   *
   * Returns milestone data points showing the knowledge base's growth
   * at key build counts (1, 10, 50, 100, 500, 1000, etc.).
   */
  getTrajectory(): readonly IKnowledgeMilestone[];

  /**
   * Get quality impact metrics — how knowledge quality correlates
   * with build quality.
   *
   * Spec Section 6.3 — "agents with rich trail injection score 91%
   *   first-pass quality on well-covered task types vs. 74% without trails."
   */
  getQualityImpact(): IKnowledgeQualityImpact;
}

/**
 * What a single build contributed to the knowledge base.
 */
export interface IBuildKnowledgeContribution {
  /** Number of new trails added by this build. */
  readonly newTrails: number;

  /** Number of existing trails validated (freshness confirmed). */
  readonly validatedTrails: number;

  /** Number of new playbooks extracted. */
  readonly newPlaybooks: number;

  /** Number of existing playbooks reinforced. */
  readonly reinforcedPlaybooks: number;

  /** Number of new anti-patterns discovered. */
  readonly newAntiPatterns: number;

  /** Number of new cross-build patterns detected. */
  readonly newCrossBuildPatterns: number;

  /** Number of new task types encountered for the first time. */
  readonly newTaskTypes: number;

  /** Domain classification for this build. */
  readonly domain: string | null;

  /** Build's evaluator score (0-1, null if not available). */
  readonly evaluatorScore: number | null;

  /** Whether this was a first-pass success. */
  readonly firstPassSuccess: boolean;

  /** Timestamp of this contribution. */
  readonly contributedAt: Date;
}

/**
 * Comprehensive health snapshot of the knowledge base.
 */
export interface IKnowledgeHealthSnapshot {
  /** Total number of builds that have contributed to the knowledge base. */
  readonly totalBuilds: number;

  // --- Volume ---

  /** Total trail entries. */
  readonly totalTrails: number;
  /** Active playbooks (not retired or merged). */
  readonly activePlaybooks: number;
  /** Active anti-patterns. */
  readonly activeAntiPatterns: number;
  /** Cross-build patterns detected. */
  readonly crossBuildPatterns: number;

  // --- Coverage ---

  /** Number of distinct task types with at least one trail. */
  readonly coveredTaskTypes: number;
  /** Number of distinct task types with rich coverage (3+ trails + playbook). */
  readonly richlyCoveredTaskTypes: number;
  /** Number of known domains. */
  readonly knownDomains: number;
  /** Domains with domain-level playbooks. */
  readonly domainsWithPlaybooks: number;

  // --- Quality ---

  /** Average playbook success rate across all active playbooks (0-1). */
  readonly averagePlaybookSuccessRate: number;
  /** Average first-pass quality for builds with rich trail coverage (0-1). */
  readonly averageRichCoverageScore: number;
  /** Average first-pass quality for builds without trail coverage (0-1). */
  readonly averageNoCoverageScore: number;
  /**
   * Quality uplift from trail coverage — the delta between rich and no coverage.
   * Spec Section 6.3 — "91% first-pass quality vs. 74% without trails."
   */
  readonly qualityUplift: number;

  // --- Freshness ---

  /** Percentage of trails validated in the last 90 days (0-1). */
  readonly trailFreshnessRate: number;
  /** Percentage of playbooks validated in the last 90 days (0-1). */
  readonly playbookFreshnessRate: number;

  /** When this snapshot was taken. */
  readonly snapshotAt: Date;
}

/**
 * A milestone in the knowledge compounding trajectory.
 */
export interface IKnowledgeMilestone {
  /** Build count at this milestone. */
  readonly buildCount: number;

  /** Total trails at this point. */
  readonly totalTrails: number;

  /** Total playbooks at this point. */
  readonly totalPlaybooks: number;

  /** Total anti-patterns at this point. */
  readonly totalAntiPatterns: number;

  /** Covered task types at this point. */
  readonly coveredTaskTypes: number;

  /** Average first-pass quality at this point (0-1, null if insufficient data). */
  readonly averageQuality: number | null;

  /** When this milestone was reached. */
  readonly reachedAt: Date;
}

/**
 * Quality impact metrics — how knowledge correlates with build quality.
 *
 * Spec Section 6.3 — "91% first-pass quality on well-covered task types
 *   vs. 74% without trails."
 */
export interface IKnowledgeQualityImpact {
  /** Builds with rich trail coverage: average first-pass score (0-1). */
  readonly withRichCoverage: number;
  /** Builds without trail coverage: average first-pass score (0-1). */
  readonly withoutCoverage: number;
  /** Quality uplift from coverage (withRichCoverage - withoutCoverage). */
  readonly uplift: number;
  /** Number of builds in the rich-coverage cohort. */
  readonly richCoverageSampleSize: number;
  /** Number of builds in the no-coverage cohort. */
  readonly noCoverageSampleSize: number;
  /** Whether the sample sizes are large enough for statistical significance. */
  readonly isSignificant: boolean;
}
