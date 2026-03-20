/**
 * GlobalMemoryService — persistent cross-project experience memory.
 *
 * Uses Qdrant with named vectors (4 axes: semantic, domain, outcome, user_intent)
 * to store multi-dimensional experience from completed builds. This is the
 * long-term memory that makes every build smarter than the last.
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import type { EmbeddingService } from './embeddings.js';
import type { ExperienceNode, ExperienceQuery } from '../types/index.js';

const COLLECTION_NAME = 'kriptik_experience';
const VECTOR_SIZE = 384;
const METADATA_POINT_ID = '00000000-0000-0000-0000-000000000000';

const VECTOR_NAMES = ['semantic', 'domain', 'outcome', 'user_intent'] as const;

export interface GlobalMemoryMetadata {
  buildCount: number;
  lastDecayCycle: number;
  createdAt: string;
  updatedAt: string;
}

interface ConvergedResult {
  id: string;
  payload: Record<string, unknown>;
  convergenceScore: number;
  dimensionsHit: number;
  averageSimilarity: number;
}

export class GlobalMemoryService {
  private qdrant: QdrantClient;
  private embeddings: EmbeddingService;
  private initialized = false;

  constructor(opts: { qdrantUrl: string; qdrantApiKey?: string; embeddings: EmbeddingService }) {
    this.qdrant = new QdrantClient({
      url: opts.qdrantUrl,
      apiKey: opts.qdrantApiKey,
      checkCompatibility: false,
    });
    this.embeddings = opts.embeddings;
  }

  /**
   * Creates the kriptik_experience collection if it doesn't exist.
   * Idempotent — safe to call on every engine start.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.qdrant.getCollection(COLLECTION_NAME);
    } catch {
      // Collection doesn't exist — create with named vectors
      await this.qdrant.createCollection(COLLECTION_NAME, {
        vectors: {
          semantic: { size: VECTOR_SIZE, distance: 'Cosine' },
          domain: { size: VECTOR_SIZE, distance: 'Cosine' },
          outcome: { size: VECTOR_SIZE, distance: 'Cosine' },
          user_intent: { size: VECTOR_SIZE, distance: 'Cosine' },
        },
      });

      // Create payload indexes for filtering
      await this.qdrant.createPayloadIndex(COLLECTION_NAME, {
        field_name: 'experienceType',
        field_schema: 'keyword',
      });
      await this.qdrant.createPayloadIndex(COLLECTION_NAME, {
        field_name: 'context.frameworks',
        field_schema: 'keyword',
      });
      await this.qdrant.createPayloadIndex(COLLECTION_NAME, {
        field_name: 'context.integrations',
        field_schema: 'keyword',
      });
      await this.qdrant.createPayloadIndex(COLLECTION_NAME, {
        field_name: 'context.appType',
        field_schema: 'keyword',
      });
      await this.qdrant.createPayloadIndex(COLLECTION_NAME, {
        field_name: 'strength',
        field_schema: 'float',
      });

      // Create metadata point
      const zeroVector = new Array(VECTOR_SIZE).fill(0);
      await this.qdrant.upsert(COLLECTION_NAME, {
        points: [
          {
            id: METADATA_POINT_ID,
            vector: {
              semantic: zeroVector,
              domain: zeroVector,
              outcome: zeroVector,
              user_intent: zeroVector,
            },
            payload: {
              _isMetadata: true,
              buildCount: 0,
              lastDecayCycle: 0,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
        ],
      });
    }

    this.initialized = true;
  }

  /**
   * Write an experience node with all 4 named vectors.
   */
  async writeExperience(experience: ExperienceNode): Promise<void> {
    // Generate text for each embedding axis
    const semanticText = `${experience.title} ${JSON.stringify(experience.content)}`;
    const domainText = [
      ...experience.context.frameworks,
      ...experience.context.integrations,
      experience.context.appType,
      experience.context.complexity,
    ]
      .filter(Boolean)
      .join(' ');
    const outcomeText = `${experience.experienceType}: ${experience.title}`;
    const intentText =
      typeof experience.content === 'object' && experience.content !== null
        ? (experience.content as Record<string, unknown>).userIntent
          ? String((experience.content as Record<string, unknown>).userIntent)
          : experience.title
        : experience.title;

    // Batch embed all 4 texts
    const vectors = await this.embedBatch([semanticText, domainText, outcomeText, intentText]);

    await this.qdrant.upsert(COLLECTION_NAME, {
      points: [
        {
          id: experience.id,
          vector: {
            semantic: vectors[0],
            domain: vectors[1],
            outcome: vectors[2],
            user_intent: vectors[3],
          },
          payload: {
            ...experience,
            content: JSON.stringify(experience.content),
          },
        },
      ],
    });
  }

  /**
   * Spreading activation query — fires parallel searches across all 4 vector
   * spaces and scores results by dimensional convergence.
   */
  async queryExperience(signals: ExperienceQuery): Promise<ExperienceNode[]> {
    const limit = signals.limit ?? 20;
    const minStrength = signals.minStrength ?? 0.1;

    // Build parallel search promises
    const searches: Array<{ name: string; promise: Promise<Array<{ id: string; score: number; payload: Record<string, unknown> }>> }> = [];

    const strengthFilter = {
      must: [
        { key: 'strength', range: { gte: minStrength } },
        {
          key: '_isMetadata',
          match: { value: false },
        },
      ],
    } as any;

    // Add context filters if provided
    const contextFilters: any[] = [...(strengthFilter.must || [])];
    if (signals.contextFilters?.frameworks?.length) {
      contextFilters.push({
        key: 'context.frameworks',
        match: { any: signals.contextFilters.frameworks },
      });
    }
    if (signals.contextFilters?.integrations?.length) {
      contextFilters.push({
        key: 'context.integrations',
        match: { any: signals.contextFilters.integrations },
      });
    }
    if (signals.contextFilters?.appType) {
      contextFilters.push({
        key: 'context.appType',
        match: { value: signals.contextFilters.appType },
      });
    }

    const filter = { must: contextFilters };

    if (signals.semanticSignal) {
      const vec = await this.embeddings.generateEmbedding(signals.semanticSignal);
      searches.push({
        name: 'semantic',
        promise: this.searchNamedVector('semantic', vec, filter, limit * 2),
      });
    }

    if (signals.domainSignal) {
      const vec = await this.embeddings.generateEmbedding(signals.domainSignal);
      searches.push({
        name: 'domain',
        promise: this.searchNamedVector('domain', vec, filter, limit * 2),
      });
    }

    if (signals.outcomeSignal) {
      const vec = await this.embeddings.generateEmbedding(signals.outcomeSignal);
      searches.push({
        name: 'outcome',
        promise: this.searchNamedVector('outcome', vec, filter, limit * 2),
      });
    }

    if (signals.intentSignal) {
      const vec = await this.embeddings.generateEmbedding(signals.intentSignal);
      searches.push({
        name: 'user_intent',
        promise: this.searchNamedVector('user_intent', vec, filter, limit * 2),
      });
    }

    if (searches.length === 0) return [];

    // Fire all searches in parallel
    const results = await Promise.all(searches.map((s) => s.promise));
    const totalDimensionsSearched = searches.length;

    // Build convergence map: id → { dimensions hit, scores per dimension, payload }
    const convergenceMap = new Map<string, {
      dimensionsHit: Set<string>;
      scores: number[];
      payload: Record<string, unknown>;
    }>();

    for (let i = 0; i < results.length; i++) {
      const dimensionName = searches[i].name;
      for (const result of results[i]) {
        const id = String(result.id);
        if (id === METADATA_POINT_ID) continue;

        if (!convergenceMap.has(id)) {
          convergenceMap.set(id, {
            dimensionsHit: new Set(),
            scores: [],
            payload: result.payload,
          });
        }
        const entry = convergenceMap.get(id)!;
        entry.dimensionsHit.add(dimensionName);
        entry.scores.push(result.score);
        // Keep the richest payload
        if (Object.keys(result.payload).length > Object.keys(entry.payload).length) {
          entry.payload = result.payload;
        }
      }
    }

    // Calculate convergence scores
    const converged: ConvergedResult[] = [];
    for (const [id, entry] of convergenceMap) {
      const avgSimilarity = entry.scores.reduce((a, b) => a + b, 0) / entry.scores.length;
      const dimensionRatio = entry.dimensionsHit.size / totalDimensionsSearched;

      // Parse strength from payload
      const strength = typeof entry.payload.strength === 'number' ? entry.payload.strength : 0.5;
      const reinforcements = typeof entry.payload.reinforcements === 'number' ? entry.payload.reinforcements : 0;
      const contradictions = typeof entry.payload.contradictions === 'number' ? entry.payload.contradictions : 0;

      const strengthWeight =
        strength * (1 + Math.log(reinforcements + 1)) / (1 + Math.log(contradictions + 1));

      const convergenceScore = dimensionRatio * avgSimilarity * strengthWeight;

      converged.push({
        id,
        payload: entry.payload,
        convergenceScore,
        dimensionsHit: entry.dimensionsHit.size,
        averageSimilarity: avgSimilarity,
      });
    }

    // Sort by convergence score descending
    converged.sort((a, b) => b.convergenceScore - a.convergenceScore);

    // Convert to ExperienceNode and limit
    return converged.slice(0, limit).map((r) => this.payloadToExperience(r.id, r.payload));
  }

  /**
   * Increment reinforcements and increase strength.
   */
  async reinforceExperience(id: string): Promise<void> {
    const point = await this.getPoint(id);
    if (!point) return;

    const payload = point.payload as Record<string, unknown>;
    const currentStrength = (payload.strength as number) || 0.5;
    const reinforcements = ((payload.reinforcements as number) || 0) + 1;

    // Diminishing returns: strong experiences get smaller boosts
    const newStrength = Math.min(1.0, currentStrength + 0.05 * (1 - currentStrength));

    await this.qdrant.setPayload(COLLECTION_NAME, {
      payload: {
        strength: newStrength,
        reinforcements,
        lastActivated: new Date().toISOString(),
      },
      points: [id],
    });
  }

  /**
   * Increment contradictions and decrease strength.
   */
  async weakenExperience(id: string): Promise<void> {
    const point = await this.getPoint(id);
    if (!point) return;

    const payload = point.payload as Record<string, unknown>;
    const currentStrength = (payload.strength as number) || 0.5;
    const contradictions = ((payload.contradictions as number) || 0) + 1;

    // Never goes to zero
    const newStrength = Math.max(0.01, currentStrength * 0.85);

    await this.qdrant.setPayload(COLLECTION_NAME, {
      payload: {
        strength: newStrength,
        contradictions,
        lastActivated: new Date().toISOString(),
      },
      points: [id],
    });
  }

  /**
   * Update strength directly (used by reinforcer).
   */
  async updateStrength(id: string, newStrength: number): Promise<void> {
    await this.qdrant.setPayload(COLLECTION_NAME, {
      payload: { strength: Math.max(0.01, Math.min(1.0, newStrength)) },
      points: [id],
    });
  }

  /**
   * Increment activation count and update lastActivated.
   */
  async incrementActivation(id: string): Promise<void> {
    const point = await this.getPoint(id);
    if (!point) return;

    const payload = point.payload as Record<string, unknown>;
    const activationCount = ((payload.activationCount as number) || 0) + 1;

    await this.qdrant.setPayload(COLLECTION_NAME, {
      payload: {
        activationCount,
        lastActivated: new Date().toISOString(),
      },
      points: [id],
    });
  }

  /**
   * Apply gentle decay to all experiences. Returns count affected.
   */
  async runDecayCycle(): Promise<number> {
    const BATCH_SIZE = 100;
    let offset: string | number | undefined = undefined;
    let totalDecayed = 0;

    // Scroll through all points
    while (true) {
      const scrollResult = await this.qdrant.scroll(COLLECTION_NAME, {
        filter: {
          must: [{ key: '_isMetadata', match: { value: false } }],
        },
        limit: BATCH_SIZE,
        offset,
        with_payload: true,
        with_vector: false,
      });

      if (!scrollResult.points || scrollResult.points.length === 0) break;

      const updates: Array<{ id: string; newStrength: number }> = [];
      for (const point of scrollResult.points) {
        const payload = point.payload as Record<string, unknown>;
        const strength = (payload.strength as number) || 0.5;
        const newStrength = Math.max(0.01, strength * 0.995);

        if (newStrength !== strength) {
          updates.push({ id: String(point.id), newStrength });
        }
      }

      // Batch update strengths
      for (const update of updates) {
        await this.qdrant.setPayload(COLLECTION_NAME, {
          payload: { strength: update.newStrength },
          points: [update.id],
        });
        totalDecayed++;
      }

      offset = scrollResult.next_page_offset as string | number | undefined;
      if (!offset) break;
    }

    // Update metadata
    await this.updateMetadataField('lastDecayCycle', Date.now());
    return totalDecayed;
  }

  /**
   * Get global memory metadata (build count, decay cycle tracking).
   */
  async getMetadata(): Promise<GlobalMemoryMetadata> {
    const point = await this.getPoint(METADATA_POINT_ID);
    if (!point) {
      return {
        buildCount: 0,
        lastDecayCycle: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    const p = point.payload as Record<string, unknown>;
    return {
      buildCount: (p.buildCount as number) || 0,
      lastDecayCycle: (p.lastDecayCycle as number) || 0,
      createdAt: (p.createdAt as string) || new Date().toISOString(),
      updatedAt: (p.updatedAt as string) || new Date().toISOString(),
    };
  }

  /**
   * Update a single metadata field.
   */
  async updateMetadataField(key: string, value: unknown): Promise<void> {
    await this.qdrant.setPayload(COLLECTION_NAME, {
      payload: { [key]: value, updatedAt: new Date().toISOString() },
      points: [METADATA_POINT_ID],
    });
  }

  /**
   * Increment the build count and return the new value.
   */
  async incrementBuildCount(): Promise<number> {
    const meta = await this.getMetadata();
    const newCount = meta.buildCount + 1;
    await this.updateMetadataField('buildCount', newCount);
    return newCount;
  }

  /**
   * Get stats about the global memory.
   */
  async getExperienceStats(): Promise<{
    totalExperiences: number;
    averageStrength: number;
    byType: Record<string, number>;
    topActivated: Array<{ id: string; title: string; activationCount: number }>;
  }> {
    const BATCH_SIZE = 100;
    let offset: string | number | undefined = undefined;
    let totalStrength = 0;
    let count = 0;
    const byType: Record<string, number> = {};
    const activated: Array<{ id: string; title: string; activationCount: number }> = [];

    while (true) {
      const scrollResult = await this.qdrant.scroll(COLLECTION_NAME, {
        filter: {
          must: [{ key: '_isMetadata', match: { value: false } }],
        },
        limit: BATCH_SIZE,
        offset,
        with_payload: true,
        with_vector: false,
      });

      if (!scrollResult.points || scrollResult.points.length === 0) break;

      for (const point of scrollResult.points) {
        const payload = point.payload as Record<string, unknown>;
        count++;
        totalStrength += (payload.strength as number) || 0;
        const type = (payload.experienceType as string) || 'unknown';
        byType[type] = (byType[type] || 0) + 1;

        activated.push({
          id: String(point.id),
          title: (payload.title as string) || '',
          activationCount: (payload.activationCount as number) || 0,
        });
      }

      offset = scrollResult.next_page_offset as string | number | undefined;
      if (!offset) break;
    }

    // Sort by activation count descending, take top 10
    activated.sort((a, b) => b.activationCount - a.activationCount);

    return {
      totalExperiences: count,
      averageStrength: count > 0 ? totalStrength / count : 0,
      byType,
      topActivated: activated.slice(0, 10),
    };
  }

  // --- Private helpers ---

  private async searchNamedVector(
    vectorName: string,
    queryVector: number[],
    filter: any,
    limit: number,
  ): Promise<Array<{ id: string; score: number; payload: Record<string, unknown> }>> {
    const results = await this.qdrant.search(COLLECTION_NAME, {
      vector: {
        name: vectorName,
        vector: queryVector,
      },
      filter,
      limit,
      with_payload: true,
    });

    return results.map((r) => ({
      id: String(r.id),
      score: r.score,
      payload: (r.payload ?? {}) as Record<string, unknown>,
    }));
  }

  private async getPoint(id: string): Promise<{ payload: Record<string, unknown> } | null> {
    try {
      const result = await this.qdrant.retrieve(COLLECTION_NAME, {
        ids: [id],
        with_payload: true,
        with_vector: false,
      });
      if (result.length === 0) return null;
      return { payload: (result[0].payload ?? {}) as Record<string, unknown> };
    } catch {
      return null;
    }
  }

  private async embedBatch(texts: string[]): Promise<number[][]> {
    // Embed in parallel for speed
    const results = await Promise.all(
      texts.map((text) => this.embeddings.generateEmbedding(text)),
    );
    return results;
  }

  private payloadToExperience(id: string, payload: Record<string, unknown>): ExperienceNode {
    let content = payload.content;
    if (typeof content === 'string') {
      try {
        content = JSON.parse(content);
      } catch {
        content = { raw: content };
      }
    }

    return {
      id,
      projectId: (payload.projectId as string) || '',
      buildTimestamp: (payload.buildTimestamp as string) || '',
      experienceType: (payload.experienceType as string) || 'discovery',
      title: (payload.title as string) || '',
      content: (content as Record<string, unknown>) || {},
      context: {
        frameworks: (payload['context.frameworks'] as string[]) || ((payload.context as any)?.frameworks as string[]) || [],
        integrations: (payload['context.integrations'] as string[]) || ((payload.context as any)?.integrations as string[]) || [],
        appType: (payload['context.appType'] as string) || ((payload.context as any)?.appType as string) || '',
        complexity: (payload['context.complexity'] as string) || ((payload.context as any)?.complexity as string) || 'moderate',
        errorCategories: (payload['context.errorCategories'] as string[]) || ((payload.context as any)?.errorCategories as string[]) || [],
      },
      strength: (payload.strength as number) || 0.5,
      activationCount: (payload.activationCount as number) || 0,
      lastActivated: (payload.lastActivated as string) || '',
      reinforcements: (payload.reinforcements as number) || 0,
      contradictions: (payload.contradictions as number) || 0,
      sourceNodes: (payload.sourceNodes as string[]) || [],
    };
  }
}
