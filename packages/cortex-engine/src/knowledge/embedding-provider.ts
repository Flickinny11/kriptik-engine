/**
 * Text-based embedding provider implementing IEmbeddingProvider.
 *
 * Uses bag-of-words with TF-IDF-inspired weighting to produce fixed-size
 * vectors from text. This is the development/testing implementation that
 * works without external API dependencies.
 *
 * Production providers (HuggingFace Inference API, OpenAI, Voyage) can be
 * swapped in via the IEmbeddingProvider interface when configured.
 *
 * Spec Section 6.3 — trails need vector embeddings for semantic retrieval.
 */

import type { IEmbeddingProvider } from "@kriptik/shared-interfaces";

/** Default vector dimensionality for the text similarity provider. */
const DEFAULT_DIMENSIONS = 128;

/**
 * Text-based embedding provider using deterministic hashing.
 *
 * Produces vectors by hashing word n-grams into fixed-size buckets
 * (feature hashing / hashing trick). This gives reasonable similarity
 * scores for trail retrieval without requiring an external embedding API.
 *
 * Not as semantically rich as transformer-based embeddings, but sufficient
 * for task-type matching, tech-stack matching, and keyword overlap —
 * which are the primary retrieval signals for trails.
 */
export class TextSimilarityEmbeddingProvider implements IEmbeddingProvider {
  readonly dimensions: number;

  constructor(dimensions: number = DEFAULT_DIMENSIONS) {
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<readonly number[]> {
    return this._computeEmbedding(text);
  }

  async embedBatch(
    texts: readonly string[],
  ): Promise<readonly (readonly number[])[]> {
    return texts.map((text) => this._computeEmbedding(text));
  }

  private _computeEmbedding(text: string): readonly number[] {
    const vector = new Float64Array(this.dimensions);
    const tokens = tokenize(text);

    // Unigrams
    for (const token of tokens) {
      const idx = hashToIndex(token, this.dimensions);
      vector[idx] += 1;
    }

    // Bigrams for phrase-level similarity
    for (let i = 0; i < tokens.length - 1; i++) {
      const bigram = `${tokens[i]}_${tokens[i + 1]}`;
      const idx = hashToIndex(bigram, this.dimensions);
      vector[idx] += 0.5;
    }

    // L2 normalize so cosine similarity works correctly
    let norm = 0;
    for (let i = 0; i < vector.length; i++) {
      norm += vector[i] * vector[i];
    }
    norm = Math.sqrt(norm);

    if (norm > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= norm;
      }
    }

    return Array.from(vector);
  }
}

/**
 * Tokenize text into lowercase words, stripping punctuation.
 * Preserves version numbers (e.g., "14.2.1") and compound identifiers
 * (e.g., "next_app_router") as single tokens.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_./\-\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/**
 * FNV-1a hash mapped to a bucket index.
 * Deterministic and fast — no crypto needed for embedding hashing.
 */
function hashToIndex(str: string, buckets: number): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash % buckets;
}
