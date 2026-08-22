import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Updated candidate list prioritizing working models
const CANDIDATE_MODELS = [
  "gemini-embedding-001",
  "text-embedding-004",
  "embedding-001",
  "text-embedding-001",
];

let cachedWorkingModel: string | null = null;

/**
 * Executes the embedContent API call for a given model name and text chunk
 */
async function callEmbedApi(modelName: string, text: string): Promise<number[]> {
  const response = await ai.models.embedContent({
    model: modelName,
    contents: text,
  });

  const values = response.embeddings?.[0]?.values;
  if (!values || values.length === 0) {
    throw new Error(`Model '${modelName}' returned empty embedding values.`);
  }

  return values;
}

/**
 * Dynamically queries Google's API to find any model supporting 'embedContent'
 */
async function discoverEmbeddingModel(): Promise<string> {
  try {
    console.log("Auto-discovering supported embedding models for your API key...");
    const modelsResponse = await ai.models.list();

    for await (const model of modelsResponse) {
      if (!model.name) continue;

      const name = model.name.replace(/^models\//, "");
      const methods: string[] =
        (model as any).supportedGenerationMethods ||
        (model as any).supportedActions ||
        [];

      if (methods.includes("embedContent") || name.includes("embed")) {
        console.log(`Discovered supported embedding model: ${name}`);
        return name;
      }
    }
  } catch (err: any) {
    console.warn("Could not list models dynamically:", err?.message || err);
  }

  return "gemini-embedding-001";
}

/**
 * Generates an embedding for a single text chunk with model discovery and rate-limit backoff.
 */
export async function embedText(
  text: string,
  retries = 3,
  backoffMs = 2000
): Promise<number[]> {
  // 1. Use cached working model if already discovered
  if (cachedWorkingModel) {
    try {
      return await callEmbedApi(cachedWorkingModel, text);
    } catch (error: any) {
      const isRateLimit =
        error?.status === 429 ||
        error?.message?.includes("429") ||
        error?.message?.includes("RESOURCE_EXHAUSTED");

      if (isRateLimit && retries > 0) {
        console.warn(
          `Rate limit hit (429) for '${cachedWorkingModel}'. Retrying in ${backoffMs / 1000}s... (${retries} retries left)`
        );
        await delay(backoffMs);
        return embedText(text, retries - 1, backoffMs * 2);
      }

      cachedWorkingModel = null;
    }
  }

  // 2. Try candidate models list first
  for (const modelName of CANDIDATE_MODELS) {
    try {
      console.log(`Testing embedding model: ${modelName}...`);
      const values = await callEmbedApi(modelName, text);

      cachedWorkingModel = modelName;
      console.log(`Successfully locked onto embedding model: ${modelName}`);
      return values;
    } catch (error: any) {
      const isNotFound =
        error?.status === 404 ||
        error?.message?.includes("404") ||
        error?.message?.includes("NOT_FOUND");

      if (isNotFound) {
        console.warn(`Model '${modelName}' 404 not found. Trying next candidate...`);
        continue;
      }

      const isRateLimit =
        error?.status === 429 ||
        error?.message?.includes("429") ||
        error?.message?.includes("RESOURCE_EXHAUSTED");

      if (isRateLimit && retries > 0) {
        console.warn(
          `Rate limit hit (429) while testing '${modelName}'. Retrying in ${backoffMs / 1000}s...`
        );
        await delay(backoffMs);
        return embedText(text, retries - 1, backoffMs * 2);
      }
    }
  }

  // 3. Fallback: Dynamic discovery via API
  const discoveredModel = await discoverEmbeddingModel();
  cachedWorkingModel = discoveredModel;
  return await callEmbedApi(discoveredModel, text);
}

/**
 * Sequentially embeds chunks with a delay between requests to stay under rate limits.
 */
export async function embedBatch(
  chunks: string[],
  delayMsBetweenRequests = 700
): Promise<number[][]> {
  const embeddings: number[][] = [];

  for (let i = 0; i < chunks.length; i++) {
    console.log(`Generating embedding for chunk ${i + 1}/${chunks.length}...`);

    const embedding = await embedText(chunks[i]);
    embeddings.push(embedding);

    if (i < chunks.length - 1) {
      await delay(delayMsBetweenRequests);
    }
  }

  return embeddings;
}

/**
 * Calculates cosine similarity between two numeric vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Ranks items by cosine similarity against a query embedding and returns top-K results.
 */
export function topKByCosineSimilarity<T extends { embedding: number[] }>(
  queryEmbedding: number[],
  items: T[],
  topK: number = 5
): (T & { similarity: number })[] {
  return items
    .map((item) => ({
      ...item,
      similarity: cosineSimilarity(queryEmbedding, item.embedding),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}