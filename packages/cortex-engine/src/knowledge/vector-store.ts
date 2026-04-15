/**
 * In-memory vector store implementing IVectorStore.
 *
 * Uses brute-force cosine similarity search over a Map of stored vectors.
 * This is the development/testing implementation — production uses Qdrant
 * via a separate QdrantVectorStore (added when Qdrant integration is wired).
 *
 * Spec Section 6.3 — "Qdrant (vector embeddings for semantic retrieval)."
 * Spec Section 6.6 Layer 4 — "Qdrant for semantic retrieval of experiential
 * trails and code patterns."
 */

import type {
  IVectorStore,
  IVectorPoint,
  IVectorSearchResult,
  IVectorFilter,
} from "@kriptik/shared-interfaces";

/** Stored point with mutable payload for upsert overwrites. */
interface StoredPoint {
  readonly id: string;
  readonly vector: readonly number[];
  payload: Record<string, unknown>;
}

/**
 * In-memory vector store using brute-force cosine similarity.
 *
 * Suitable for development and testing without a running Qdrant instance.
 * Performance is O(n) per search where n is the collection size — adequate
 * for trail databases up to ~10,000 entries.
 */
export class InMemoryVectorStore implements IVectorStore {
  private readonly _collections = new Map<string, Map<string, StoredPoint>>();

  async ensureCollection(name: string, _vectorSize: number): Promise<void> {
    if (!this._collections.has(name)) {
      this._collections.set(name, new Map());
    }
  }

  async upsert(
    collection: string,
    points: readonly IVectorPoint[],
  ): Promise<void> {
    const col = this._getCollection(collection);
    for (const point of points) {
      col.set(point.id, {
        id: point.id,
        vector: point.vector,
        payload: { ...point.payload },
      });
    }
  }

  async search(
    collection: string,
    queryVector: readonly number[],
    limit: number,
    filters?: readonly IVectorFilter[],
  ): Promise<readonly IVectorSearchResult[]> {
    const col = this._getCollection(collection);

    const results: IVectorSearchResult[] = [];

    for (const point of col.values()) {
      if (filters && !this._matchesFilters(point.payload, filters)) {
        continue;
      }

      const score = cosineSimilarity(queryVector, point.vector);
      results.push({
        id: point.id,
        score,
        payload: { ...point.payload },
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  async delete(collection: string, ids: readonly string[]): Promise<void> {
    const col = this._getCollection(collection);
    for (const id of ids) {
      col.delete(id);
    }
  }

  async close(): Promise<void> {
    this._collections.clear();
  }

  private _getCollection(name: string): Map<string, StoredPoint> {
    const col = this._collections.get(name);
    if (!col) {
      throw new Error(`Vector collection "${name}" does not exist. Call ensureCollection() first.`);
    }
    return col;
  }

  private _matchesFilters(
    payload: Record<string, unknown>,
    filters: readonly IVectorFilter[],
  ): boolean {
    for (const filter of filters) {
      if (payload[filter.field] !== filter.match) {
        return false;
      }
    }
    return true;
  }
}

/**
 * Cosine similarity between two vectors.
 * Returns a value between -1 and 1, where 1 means identical direction.
 */
function cosineSimilarity(
  a: readonly number[],
  b: readonly number[],
): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}
