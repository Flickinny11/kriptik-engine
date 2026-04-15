/**
 * Librarian — knowledge base custodian.
 *
 * Composes the TrailExtractor, TrailStore, VectorStore, EmbeddingProvider,
 * and TrailRanker into a single facade that manages the full trail lifecycle:
 *
 * 1. Capture — ESAA events are routed to the TrailExtractor for buffering
 * 2. Finalization — when goals reach terminal state, trails are extracted
 *    and persisted to both SQLite (structured) and Qdrant (vector)
 * 3. Retrieval — trails are queried by semantic similarity, then ranked
 *    by the six-factor algorithm for golden window injection
 * 4. Freshness — trails are marked validated when confirmed in builds
 *
 * Spec Section 3.2 — "Manages the knowledge base. Captures experiential
 * trail entries from all agent sessions in real time."
 *
 * Spec Section 6.3 — "The Librarian is the custodian of the system's
 * compounding intelligence."
 */

import type {
  ILibrarian,
  ITrailStore,
  IVectorStore,
  IEmbeddingProvider,
  ITrailExtractor,
  ITrailRanker,
  ITrailEntry,
  ITrailRankingCriteria,
  IRankedTrail,
  TrailOutcome,
  IESAAEvent,
} from "@kriptik/shared-interfaces";

/** The Qdrant collection name for trail embeddings. */
const TRAIL_COLLECTION = "cortex_trails";

/**
 * Configuration for the Librarian.
 */
export interface LibrarianConfig {
  /** The structured trail store (SQLite). */
  readonly trailStore: ITrailStore;
  /** The vector store for semantic retrieval (Qdrant or in-memory). */
  readonly vectorStore: IVectorStore;
  /** The embedding provider for converting trails to vectors. */
  readonly embeddingProvider: IEmbeddingProvider;
  /** The trail extractor for processing ESAA events. */
  readonly trailExtractor: ITrailExtractor;
  /** The trail ranker for scoring retrieved trails. */
  readonly trailRanker: ITrailRanker;
}

/**
 * Librarian implementation.
 *
 * For Step 7, the Librarian is deterministic — it routes events, stores
 * trails, and ranks mechanically. Phase D (Step 18) adds ACE-style
 * evolving playbooks where the Librarian uses an LLM session for
 * strategy generation and curation.
 */
export class Librarian implements ILibrarian {
  private readonly _trailStore: ITrailStore;
  private readonly _vectorStore: IVectorStore;
  private readonly _embeddingProvider: IEmbeddingProvider;
  private readonly _trailExtractor: ITrailExtractor;
  private readonly _trailRanker: ITrailRanker;

  constructor(config: LibrarianConfig) {
    this._trailStore = config.trailStore;
    this._vectorStore = config.vectorStore;
    this._embeddingProvider = config.embeddingProvider;
    this._trailExtractor = config.trailExtractor;
    this._trailRanker = config.trailRanker;
  }

  async initialize(): Promise<void> {
    await this._trailStore.initialize();
    await this._vectorStore.ensureCollection(
      TRAIL_COLLECTION,
      this._embeddingProvider.dimensions,
    );
  }

  processEvent(event: IESAAEvent): void {
    this._trailExtractor.processEvent(event);
  }

  async finalizeAndStoreTrail(
    agentId: string,
    goalId: string,
    taskType: string,
    outcome: TrailOutcome,
  ): Promise<ITrailEntry | null> {
    const trail = this._trailExtractor.finalizeTrail(
      agentId,
      goalId,
      taskType,
      outcome,
    );

    if (!trail) return null;

    // Persist to SQLite — returns the trail with its generated ID
    const stored = await this._trailStore.insert(trail);

    // Generate embedding from the trail's decision + reasoning + gotchas
    const embeddingText = buildEmbeddingText(stored);
    const vector = await this._embeddingProvider.embed(embeddingText);

    // Persist to vector store for semantic retrieval
    await this._vectorStore.upsert(TRAIL_COLLECTION, [
      {
        id: stored.id,
        vector,
        payload: {
          taskType: stored.taskType,
          trailType: stored.trailType,
          outcome: stored.outcome,
          buildId: stored.buildId,
          recordedAt: stored.recordedAt.toISOString(),
        },
      },
    ]);

    return stored;
  }

  async retrieveTrails(
    criteria: ITrailRankingCriteria,
  ): Promise<readonly IRankedTrail[]> {
    // Generate query embedding from the task type + tech stack
    const queryText = buildQueryText(criteria);
    const queryVector = await this._embeddingProvider.embed(queryText);

    // Retrieve candidate trails from vector store (fetch more than needed
    // so the ranker has a good pool to select from)
    const candidateLimit = Math.max(criteria.maxTrails * 5, 20);
    const vectorResults = await this._vectorStore.search(
      TRAIL_COLLECTION,
      queryVector,
      candidateLimit,
    );

    if (vectorResults.length === 0) {
      return [];
    }

    // Fetch full trail entries from SQLite
    const trails: ITrailEntry[] = [];
    for (const result of vectorResults) {
      const trail = await this._trailStore.getById(result.id);
      if (trail) {
        trails.push(trail);
      }
    }

    // Rank by the six-factor algorithm
    return this._trailRanker.rank(trails, criteria);
  }

  async markTrailValidated(trailId: string): Promise<void> {
    await this._trailStore.markValidated(trailId, new Date());
  }

  async getTrailCoverage(taskType: string): Promise<number> {
    return this._trailStore.count({ taskType });
  }

  async getFullCoverageMap(): Promise<ReadonlyMap<string, number>> {
    return this._trailStore.getTaskTypeCoverage();
  }

  async close(): Promise<void> {
    await this._trailStore.close();
    await this._vectorStore.close();
  }
}

/**
 * Build the text to embed for a trail entry.
 *
 * Combines the most semantically meaningful fields: task type, decision,
 * reasoning, gotchas, and dependencies. This gives the embedding model
 * (or hashing provider) enough signal to find similar trails.
 */
function buildEmbeddingText(trail: ITrailEntry): string {
  const parts = [
    trail.taskType.replace(/_/g, " "),
    trail.decision,
    trail.reasoning,
  ];

  if (trail.gotchasEncountered.length > 0) {
    parts.push(trail.gotchasEncountered.join(". "));
  }

  if (trail.dependenciesUsed.length > 0) {
    parts.push(trail.dependenciesUsed.join(", "));
  }

  return parts.join(" | ");
}

/**
 * Build query text from ranking criteria for vector search.
 */
function buildQueryText(criteria: ITrailRankingCriteria): string {
  const parts = [criteria.taskType.replace(/_/g, " ")];

  if (criteria.techStack.length > 0) {
    parts.push(criteria.techStack.join(", "));
  }

  return parts.join(" | ");
}
