import { GoogleGenerativeAI } from "@google/generative-ai";

// Google's Gemini API has a genuinely free, no-credit-card tier that includes
// this embedding model — that's why it's used here instead of OpenAI's
// (which requires billing to be enabled before any call succeeds).
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
const EMBEDDING_MODEL = "text-embedding-004"; // 768 dims, free tier, good enough for this scale

export async function embedText(text: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
  const res = await model.embedContent(text);
  return res.embedding.values;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
  // Gemini's SDK embeds one string per call — batch them concurrently
  // instead of one-by-one to keep this fast for a multi-chunk document.
  const results = await Promise.all(texts.map((t) => model.embedContent(t)));
  return results.map((r) => r.embedding.values);
}

/**
 * Cosine similarity between two vectors of the same length.
 * 1 = identical direction (very similar meaning), 0 = unrelated, -1 = opposite.
 * This is the "search" step of retrieval-augmented generation: we compute this
 * between the user's question and every stored chunk, then keep the top matches.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
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

export function topKByCosineSimilarity<T extends { embedding: number[] }>(
  queryEmbedding: number[],
  items: T[],
  k: number
): (T & { score: number })[] {
  return items
    .map((item) => ({ ...item, score: cosineSimilarity(queryEmbedding, item.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
