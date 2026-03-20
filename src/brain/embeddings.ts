import { QdrantClient } from '@qdrant/js-client-rest';
import { InferenceClient } from '@huggingface/inference';

const EMBEDDING_MODEL = 'sentence-transformers/all-MiniLM-L6-v2';
const VECTOR_SIZE = 384;

export interface EmbeddingService {
  generateEmbedding(text: string): Promise<number[]>;
  generateEmbeddingBatch(texts: string[]): Promise<number[][]>;
  ensureCollection(collectionName: string): Promise<void>;
  upsertVector(
    collectionName: string,
    pointId: string,
    vector: number[],
    payload: Record<string, unknown>,
  ): Promise<void>;
  searchVectors(
    collectionName: string,
    queryVector: number[],
    filter: Record<string, unknown>,
    limit: number,
  ): Promise<Array<{ id: string; score: number; payload: Record<string, unknown> }>>;
  deleteVector(collectionName: string, pointId: string): Promise<void>;
}

export function createEmbeddingService(opts: {
  qdrantUrl: string;
  qdrantApiKey?: string;
  hfApiKey?: string;
}): EmbeddingService {
  const qdrant = new QdrantClient({
    url: opts.qdrantUrl,
    apiKey: opts.qdrantApiKey,
    checkCompatibility: false,
  });

  const hf = new InferenceClient(opts.hfApiKey);

  // Track which collections we've already ensured exist this session
  const ensuredCollections = new Set<string>();

  async function generateEmbedding(text: string): Promise<number[]> {
    // Truncate to ~500 chars to keep embeddings fast and cheap
    const truncated = text.slice(0, 500);
    const result = await hf.featureExtraction({
      model: EMBEDDING_MODEL,
      inputs: truncated,
    });
    // featureExtraction returns number[] for single input
    return result as number[];
  }

  async function generateEmbeddingBatch(texts: string[]): Promise<number[][]> {
    // HuggingFace featureExtraction supports batch inputs
    const truncated = texts.map((t) => t.slice(0, 500));
    const results = await Promise.all(
      truncated.map((text) =>
        hf.featureExtraction({
          model: EMBEDDING_MODEL,
          inputs: text,
        }),
      ),
    );
    return results as number[][];
  }

  async function ensureCollection(collectionName: string): Promise<void> {
    if (ensuredCollections.has(collectionName)) return;

    try {
      await qdrant.getCollection(collectionName);
    } catch {
      await qdrant.createCollection(collectionName, {
        vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
      });
      // Create payload indexes for filtering
      await qdrant.createPayloadIndex(collectionName, {
        field_name: 'projectId',
        field_schema: 'keyword',
      });
      await qdrant.createPayloadIndex(collectionName, {
        field_name: 'nodeType',
        field_schema: 'keyword',
      });
    }
    ensuredCollections.add(collectionName);
  }

  async function upsertVector(
    collectionName: string,
    pointId: string,
    vector: number[],
    payload: Record<string, unknown>,
  ): Promise<void> {
    await ensureCollection(collectionName);
    await qdrant.upsert(collectionName, {
      points: [
        {
          id: pointId,
          vector,
          payload,
        },
      ],
    });
  }

  async function searchVectors(
    collectionName: string,
    queryVector: number[],
    filter: Record<string, unknown>,
    limit: number,
  ): Promise<Array<{ id: string; score: number; payload: Record<string, unknown> }>> {
    await ensureCollection(collectionName);
    const results = await qdrant.search(collectionName, {
      vector: queryVector,
      filter: filter as any,
      limit,
      with_payload: true,
    });

    return results.map((r) => ({
      id: String(r.id),
      score: r.score,
      payload: (r.payload ?? {}) as Record<string, unknown>,
    }));
  }

  async function deleteVector(collectionName: string, pointId: string): Promise<void> {
    await qdrant.delete(collectionName, {
      points: [pointId],
    });
  }

  return {
    generateEmbedding,
    generateEmbeddingBatch,
    ensureCollection,
    upsertVector,
    searchVectors,
    deleteVector,
  };
}
