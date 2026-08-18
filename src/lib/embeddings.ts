import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) {
  throw new Error("GOOGLE_API_KEY environment variable is required.");
}

const ai = new GoogleGenAI({ apiKey });

// Active Google GenAI embedding model identifier
const EMBEDDING_MODEL = "gemini-embedding-001";

/**
 * Embeds a single string into a vector representation.
 */
export async function embedText(text: string): Promise<number[]> {
  try {
    const response = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
    });

    const values = response.embeddings?.[0]?.values;
    if (!values) {
      throw new Error("No embedding values returned from Google GenAI API.");
    }

    return values;
  } catch (error) {
    console.error("Error generating text embedding:", error);
    throw error;
  }
}

/**
 * Embeds multiple text chunks safely in small batches to avoid API rate limits.
 */
export async function embedBatch(
  texts: string[],
  batchSize = 10
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const embeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map((text) =>
        ai.models.embedContent({
          model: EMBEDDING_MODEL,
          contents: text,
        })
      )
    );

    for (const res of batchResults) {
      const values = res.embeddings?.[0]?.values;
      if (!values) {
        throw new Error("Missing values in embedding batch result item.");
      }
      embeddings.push(values);
    }

    // Small delay between batches to respect rate limits
    if (i + batchSize < texts.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return embeddings;
}

/**
 * Cosine similarity between two vectors of equal length.
 * 1 = identical direction, 0 = orthogonal/unrelated, -1 = opposite.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Ranks stored items by cosine similarity to a query embedding vector and returns top K.
 */
export function topKByCosineSimilarity<T extends { embedding: number[] }>(
  queryEmbedding: number[],
  items: T[],
  k: number
): (T & { score: number })[] {
  if (k <= 0) return [];

  return items
    .map((item) => ({
      ...item,
      score: cosineSimilarity(queryEmbedding, item.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}