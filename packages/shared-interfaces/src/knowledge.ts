/**
 * Knowledge and learning system interfaces — experiential trails, the
 * Librarian's knowledge base, and the continuous learning pipeline.
 *
 * Spec Section 6.1 — Three-Layer Knowledge Architecture
 * Spec Section 6.3 — Experiential Trail System
 * Spec Section 6.4 — ACE-Style Evolving Playbooks
 * Spec Section 6.6 — Five-Layer Memory Architecture
 */

import type { IESAAEvent } from "./state.js";

// ---------------------------------------------------------------------------
// Trail entries
// ---------------------------------------------------------------------------

/**
 * The types of experiential trails captured by the system.
 * Spec Section 6.3 — Trail Types and Their Uses.
 */
export type TrailType =
  | "implementation"    // Successful implementations with decisions, reasoning, outcomes
  | "dead-end"          // Approaches tried and abandoned, with reasoning for failure
  | "violation"         // Implementations fired for contract violations (extra injection weight)
  | "alternative"       // Losing implementations from competitive generation
  | "cross-build";      // Aggregated insights emerging across many builds

/** Outcome classification for implementation trails. */
export type TrailOutcome =
  | "passed_first_pass"    // Merged without any rejection
  | "passed_after_fix"     // Merged after minor fixes
  | "required_rotation"    // Required agent rotation to complete
  | "required_firing"      // Required agent firing and replacement
  | "abandoned";           // Dead-end — approach was abandoned

/**
 * ITrailEntry — an experiential trail record.
 *
 * Every decision an agent makes, every dead end it hits, every correction
 * it applies is captured as a structured trail entry. These are the building
 * blocks of Cortex's compounding intelligence.
 *
 * Spec Section 6.3 — "Trails are stored in SQLite (structured data) + Qdrant
 * (vector embeddings for semantic retrieval)."
 */
export interface ITrailEntry {
  /** Unique trail identifier. */
  readonly id: string;
  /** Trail type classification. */
  readonly trailType: TrailType;

  /**
   * Task type for routing and retrieval (e.g. "stripe_billing_next_app_router").
   * This is the primary key for trail matching during golden window formation.
   */
  readonly taskType: string;

  /** What decision was made. */
  readonly decision: string;
  /** Why this decision was made. */
  readonly reasoning: string;
  /** What happened as a result. */
  readonly outcome: TrailOutcome;

  /** Evaluator score if applicable (0-1). */
  readonly evaluatorScore: number | null;
  /** Files created or modified. */
  readonly filesAffected: readonly string[];
  /** Dependencies used (with versions). */
  readonly dependenciesUsed: readonly string[];
  /** Gotchas encountered during implementation. */
  readonly gotchasEncountered: readonly string[];
  /** How the gotcha was resolved, if applicable. */
  readonly resolution: string | null;

  /** The build that produced this trail. */
  readonly buildId: string;
  /** The agent session that produced this trail. */
  readonly agentId: string;
  /** When this trail was recorded. */
  readonly recordedAt: Date;

  /**
   * When this trail was last validated in a real build.
   * Trails that haven't been confirmed recently are deprecated by the Librarian.
   * Spec Section 3.2 (Librarian) — "tracks trail freshness."
   */
  readonly lastValidatedAt: Date | null;
}

// ---------------------------------------------------------------------------
// Trail ranking
// ---------------------------------------------------------------------------

/**
 * Parameters used to rank trails for injection into an agent's golden window.
 * Spec Section 6.3 — Trail Ranking and Injection.
 */
export interface ITrailRankingCriteria {
  /** The task type to match against. */
  readonly taskType: string;
  /** The tech stack for stack-match scoring. */
  readonly techStack: readonly string[];
  /** Maximum number of trails to return (typically 3-7). */
  readonly maxTrails: number;
  /** Whether to boost violation trails. */
  readonly boostViolations: boolean;
}

/**
 * A ranked trail ready for injection into an agent's context.
 */
export interface IRankedTrail {
  readonly trail: ITrailEntry;
  /** Composite ranking score (higher = more relevant). */
  readonly score: number;
  /** Breakdown of ranking factors. */
  readonly factors: {
    readonly taskTypeMatch: number;
    readonly techStackMatch: number;
    readonly outcomeQuality: number;
    readonly recency: number;
    readonly violationBoost: number;
    readonly freshness: number;
  };
}

// ---------------------------------------------------------------------------
// Trail store (SQLite persistence)
// ---------------------------------------------------------------------------

/**
 * Query parameters for retrieving trails from the store.
 * Spec Section 6.3 — trails stored in SQLite for structured queries.
 */
export interface ITrailQuery {
  /** Filter by build ID. */
  readonly buildId?: string;
  /** Filter by agent ID. */
  readonly agentId?: string;
  /** Filter by task type (exact match). */
  readonly taskType?: string;
  /** Filter by trail type. */
  readonly trailType?: TrailType;
  /** Filter by outcome. */
  readonly outcome?: TrailOutcome;
  /** Only trails recorded after this date. */
  readonly recordedAfter?: Date;
  /** Maximum number of results. */
  readonly limit?: number;
  /** Order by field. */
  readonly orderBy?: "recordedAt" | "evaluatorScore";
  /** Order direction. */
  readonly orderDirection?: "asc" | "desc";
}

/**
 * ITrailStore — persistent storage for experiential trails.
 *
 * Backed by SQLite for structured queries (by build, goal, task type, outcome).
 * Each trail is also integrity-hashed so the chain of decisions is auditable.
 *
 * Spec Section 6.3 — "Trails are stored in SQLite (structured data)."
 */
export interface ITrailStore {
  /** Initialize the database schema (creates tables and indexes if needed). */
  initialize(): Promise<void>;

  /** Insert a new trail entry. Returns the stored trail with generated ID. */
  insert(trail: Omit<ITrailEntry, "id">): Promise<ITrailEntry>;

  /** Retrieve a trail by its ID. */
  getById(id: string): Promise<ITrailEntry | null>;

  /** Query trails with structured filters. */
  query(params: ITrailQuery): Promise<readonly ITrailEntry[]>;

  /** Update the lastValidatedAt timestamp for a trail. */
  markValidated(trailId: string, validatedAt: Date): Promise<void>;

  /** Count trails matching the given query. */
  count(params: ITrailQuery): Promise<number>;

  /**
   * Get all distinct task types with their trail counts.
   * Used by the Librarian to assess trail coverage density.
   */
  getTaskTypeCoverage(): Promise<ReadonlyMap<string, number>>;

  /** Close the database connection. */
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Vector store (Qdrant abstraction)
// ---------------------------------------------------------------------------

/** A single vector point for storage/retrieval. */
export interface IVectorPoint {
  /** Unique identifier for this vector. */
  readonly id: string;
  /** The embedding vector. */
  readonly vector: readonly number[];
  /** Metadata payload stored alongside the vector. */
  readonly payload: Record<string, unknown>;
}

/** A search result from the vector store. */
export interface IVectorSearchResult {
  /** The matched point ID. */
  readonly id: string;
  /** Similarity score (higher = more similar). */
  readonly score: number;
  /** The metadata payload. */
  readonly payload: Record<string, unknown>;
}

/** Filter for narrowing vector search results by payload fields. */
export interface IVectorFilter {
  /** Field name in the payload. */
  readonly field: string;
  /** Match condition. */
  readonly match: string | number | boolean;
}

/**
 * IVectorStore — abstraction over vector storage and semantic retrieval.
 *
 * Primary implementation: Qdrant. Fallback: in-memory brute-force cosine
 * similarity for testing without a running Qdrant instance.
 *
 * Spec Section 6.3 — "Qdrant (vector embeddings for semantic retrieval)."
 * Spec Section 6.6 Layer 4 — "Qdrant for semantic retrieval of experiential
 * trails and code patterns."
 */
export interface IVectorStore {
  /**
   * Ensure a collection exists with the given vector dimensionality.
   * Creates the collection if it doesn't exist; no-op if it does.
   */
  ensureCollection(name: string, vectorSize: number): Promise<void>;

  /** Upsert vectors into a collection. */
  upsert(collection: string, points: readonly IVectorPoint[]): Promise<void>;

  /**
   * Search for similar vectors.
   * @param collection — collection name
   * @param queryVector — the query embedding
   * @param limit — max results to return
   * @param filters — optional payload field filters
   */
  search(
    collection: string,
    queryVector: readonly number[],
    limit: number,
    filters?: readonly IVectorFilter[],
  ): Promise<readonly IVectorSearchResult[]>;

  /** Delete vectors by ID. */
  delete(collection: string, ids: readonly string[]): Promise<void>;

  /** Close the connection. */
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Embedding provider
// ---------------------------------------------------------------------------

/**
 * IEmbeddingProvider — generates vector embeddings from text.
 *
 * Abstracted so the system works with pluggable providers:
 * - HuggingFace Inference API (production)
 * - Text-based similarity fallback (development/testing)
 *
 * Spec Section 6.3 — trails need vector embeddings for semantic retrieval.
 */
export interface IEmbeddingProvider {
  /** Generate an embedding vector for a single text. */
  embed(text: string): Promise<readonly number[]>;

  /** Generate embeddings for multiple texts (batch). */
  embedBatch(texts: readonly string[]): Promise<readonly (readonly number[])[]>;

  /** The dimensionality of vectors produced by this provider. */
  readonly dimensions: number;
}

// ---------------------------------------------------------------------------
// Trail extractor
// ---------------------------------------------------------------------------

/**
 * ITrailExtractor — synthesizes experiential trail entries from ESAA event
 * sequences. Correlates events by agent+goal to produce one trail per
 * completed goal.
 *
 * Spec Section 6.3 — "Every decision an agent makes, every dead end it hits,
 * every correction it applies is captured as a structured experiential
 * trail entry."
 */
export interface ITrailExtractor {
  /**
   * Process an ESAA event. The extractor buffers events and correlates
   * them by agentId + goalId to build up trail context.
   */
  processEvent(event: IESAAEvent): void;

  /**
   * Finalize a trail for a completed goal. Called when a goal reaches
   * a terminal state (merged, abandoned, fired). Returns the extracted
   * trail entry, or null if insufficient data to form a trail.
   *
   * @param agentId — the agent that worked on this goal
   * @param goalId — the goal that reached terminal state
   * @param taskType — the task type classification for trail routing
   * @param outcome — the outcome of the goal
   */
  finalizeTrail(
    agentId: string,
    goalId: string,
    taskType: string,
    outcome: TrailOutcome,
  ): ITrailEntry | null;

  /** Clear buffered events for a specific agent (e.g., after rotation). */
  clearAgent(agentId: string): void;

  /** Clear all buffered events. */
  clearAll(): void;
}

// ---------------------------------------------------------------------------
// Trail ranker
// ---------------------------------------------------------------------------

/**
 * ITrailRanker — ranks retrieved trails by relevance to the current goal.
 *
 * Uses six ranking factors from spec Section 6.3:
 * 1. Task type match — exact task type match ranks highest
 * 2. Tech stack match — same framework/library versions rank higher
 * 3. Outcome quality — higher evaluator scores rank higher
 * 4. Recency — more recent trails rank higher (APIs evolve)
 * 5. Violation weight — violation trails get a ranking boost
 * 6. Trail freshness — recently validated trails rank higher
 *
 * Spec Section 6.3 — "Trail Ranking and Injection."
 */
export interface ITrailRanker {
  /**
   * Rank a set of candidate trails against the given criteria.
   * Returns trails sorted by composite score (descending), limited
   * to criteria.maxTrails.
   */
  rank(
    trails: readonly ITrailEntry[],
    criteria: ITrailRankingCriteria,
  ): readonly IRankedTrail[];
}

// ---------------------------------------------------------------------------
// Librarian (knowledge base custodian)
// ---------------------------------------------------------------------------

/**
 * ILibrarian — the knowledge base custodian.
 *
 * Manages the full trail lifecycle: capture from ESAA events, storage in
 * SQLite + Qdrant, ranking for golden window injection, and freshness
 * tracking.
 *
 * Spec Section 3.2 — "Manages the knowledge base. Captures experiential trail
 * entries from all agent sessions in real time. Maintains the anti-pattern
 * library. Indexes trails for retrieval. Handles trail ranking for injection
 * into future agents."
 *
 * Spec Section 6.3 — "The Librarian is the custodian of the system's
 * compounding intelligence."
 */
export interface ILibrarian {
  /** Initialize storage backends (SQLite schema, vector collections). */
  initialize(): Promise<void>;

  /**
   * Process an ESAA event from any agent session.
   * The Librarian routes events to the TrailExtractor for buffering.
   */
  processEvent(event: IESAAEvent): void;

  /**
   * Finalize and store a trail when a goal reaches terminal state.
   * Persists to both SQLite (structured) and Qdrant (vector).
   */
  finalizeAndStoreTrail(
    agentId: string,
    goalId: string,
    taskType: string,
    outcome: TrailOutcome,
  ): Promise<ITrailEntry | null>;

  /**
   * Retrieve and rank trails for golden window injection.
   * This is the primary query path used during golden window formation.
   *
   * Spec Section 6.3 — "The top 3-7 trails are injected, consuming
   * approximately 2,000-5,000 tokens of the golden window."
   */
  retrieveTrails(criteria: ITrailRankingCriteria): Promise<readonly IRankedTrail[]>;

  /**
   * Mark a trail as validated (confirmed working in a recent build).
   * Spec Section 3.2 — "tracks trail freshness."
   */
  markTrailValidated(trailId: string): Promise<void>;

  /**
   * Get trail coverage density for a task type.
   * Used by the model routing layer (Phase D) to decide Opus vs Sonnet.
   *
   * Spec Section 6.3 — "well-covered task types" score 91% first-pass.
   */
  getTrailCoverage(taskType: string): Promise<number>;

  /**
   * Get coverage map for all known task types.
   * Used by the Librarian to assess overall knowledge base health.
   */
  getFullCoverageMap(): Promise<ReadonlyMap<string, number>>;

  /** Shut down storage backends. */
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Dynamic documentation — Context7 MCP integration (Layer 2)
// ---------------------------------------------------------------------------

/**
 * A resolved documentation fragment from any source in the documentation
 * priority chain (Context7 MCP → skill files → web search).
 *
 * Spec Section 6.1 Layer 2 — "Context7 MCP Server — integrated as a Tier 1
 * shared service, fetches version-specific documentation for any library."
 */
export interface IDocumentationFragment {
  /** The library or integration this documentation covers (e.g., "next", "stripe"). */
  readonly library: string;
  /** Specific version the documentation applies to, if known. */
  readonly version: string | null;
  /** The documentation content (markdown). */
  readonly content: string;
  /** Which source in the priority chain produced this fragment. */
  readonly source: DocumentationSource;
  /** When this fragment was fetched (for cache staleness). */
  readonly fetchedAt: Date;
}

/**
 * Source of a documentation fragment in the priority chain.
 * Spec Section 6.1 Layer 2 — priority order: Context7 → skill files → web search.
 */
export type DocumentationSource =
  | "context7"       // Context7 MCP server (preferred — current, version-specific)
  | "skill-file"     // Platform SKILL.md files (curated multi-step integration guides)
  | "web-search"     // Web search fallback (for libraries not covered by Context7)
  | "ice-constraints"; // Already in goal assignment via ICE Stage 3

/**
 * IContext7Provider — fetches version-specific documentation for any library
 * via the Context7 MCP server.
 *
 * Context7 provides CURRENT documentation — not the training data version.
 * When an agent needs to implement Stripe, Next.js, or Supabase, Context7
 * provides up-to-date API references, gotchas, and patterns.
 *
 * Spec Section 6.1 Layer 2 — "Context7 MCP Server — integrated as a Tier 1
 * shared service, fetches version-specific documentation for any library."
 * Spec Section 4.2 — Tier 1 Shared Services (Knowledge Base, Context7, etc.)
 */
export interface IContext7Provider {
  /**
   * Resolve the Context7-compatible identifier for a library.
   * Maps common names (e.g., "next", "react") to their Context7 library IDs.
   * Returns null if the library is not available in Context7.
   */
  resolveLibraryId(libraryName: string): Promise<string | null>;

  /**
   * Fetch documentation for a library, optionally for a specific topic.
   *
   * @param libraryId — the Context7-resolved library identifier
   * @param topic — optional topic focus (e.g., "app router", "webhooks")
   * @param maxTokens — maximum tokens of documentation to return (default: 5000)
   */
  getDocumentation(
    libraryId: string,
    topic?: string,
    maxTokens?: number,
  ): Promise<IDocumentationFragment | null>;

  /**
   * Check whether the Context7 MCP server is available and responsive.
   * Used by the DocumentationResolver to decide whether to skip to fallbacks.
   */
  isAvailable(): Promise<boolean>;
}

/**
 * A documentation need derived from a goal assignment. Represents a library
 * or integration that an agent will need documentation for.
 *
 * Spec Section 6.1 Layer 1 — "before implementing ANY external integration:
 * check skill files, use Context7 MCP for current docs, fall back to web
 * search. NEVER rely on training knowledge for API endpoints."
 */
export interface IDocumentationNeed {
  /** The library or integration name (e.g., "stripe", "next", "supabase"). */
  readonly library: string;
  /** Specific version constraint, if known from the goal's dependency spec. */
  readonly version?: string;
  /** Specific topic within the library (e.g., "webhooks", "app router"). */
  readonly topic?: string;
}

/**
 * Result of resolving documentation for a goal assignment.
 * Contains all resolved fragments plus any libraries that couldn't be resolved.
 */
export interface IDocumentationResult {
  /** Successfully resolved documentation fragments. */
  readonly fragments: readonly IDocumentationFragment[];
  /** Libraries for which no documentation could be found in any source. */
  readonly unresolved: readonly string[];
  /** Total token estimate for all fragments combined. */
  readonly totalTokenEstimate: number;
}

/**
 * IDocumentationResolver — resolves documentation needs for a goal assignment
 * using the spec-defined priority chain.
 *
 * Priority chain (Spec Section 6.1 Layer 2):
 * 1. Context7 MCP — current, version-specific API documentation
 * 2. Platform skill files — curated SKILL.md files for complex integrations
 * 3. Web search fallback — for libraries not covered by Context7 or skill files
 *
 * ICE Stage 3 technical constraint maps are already in the goal assignment
 * and are not fetched by the resolver — they're treated as Layer 1 baked-in context.
 *
 * Spec Section 6.1 Layer 2 — Dynamic Documentation
 * Spec Section 4.2 — Tier 1 Shared Services
 */
export interface IDocumentationResolver {
  /**
   * Resolve documentation for a set of needs derived from a goal assignment.
   * Tries each source in priority order, stopping when documentation is found
   * for each library.
   *
   * @param needs — the libraries and topics requiring documentation
   * @param maxTotalTokens — budget cap for total documentation tokens (default: 15000)
   */
  resolve(
    needs: readonly IDocumentationNeed[],
    maxTotalTokens?: number,
  ): Promise<IDocumentationResult>;

  /**
   * Extract documentation needs from a goal assignment's dependency spec
   * and constraint maps. Identifies which libraries require fresh documentation.
   */
  extractNeeds(
    dependencies: readonly string[],
    constraints: Record<string, unknown>,
  ): IDocumentationNeed[];
}
