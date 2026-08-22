import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) {
  throw new Error("GOOGLE_API_KEY environment variable is required.");
}

const ai = new GoogleGenAI({ apiKey });

// Active Google GenAI models
const MODELS_TO_TRY = [
  "gemini-3.6-flash",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
];

/**
 * Generic helper with retry and model fallback logic.
 */
async function generateContentWithFallback(
  prompt: string,
  systemInstruction?: string
): Promise<string> {
  let lastError: any = null;

  for (const modelName of MODELS_TO_TRY) {
    let retries = 2;
    let delay = 1000;

    while (retries >= 0) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: systemInstruction
            ? { systemInstruction }
            : undefined,
        });

        if (response.text) {
          return response.text;
        }
      } catch (error: any) {
        lastError = error;
        console.warn(`[${modelName}] Attempt failed (${error?.message || error}).`);

        // Only retry if it's a rate limit or server busy error (not a 404 bad model name)
        if (error?.status === 404 || error?.message?.includes("404")) {
          break; // Immediately jump to the next model in MODELS_TO_TRY
        }

        if (retries > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2; // Exponential backoff
          retries--;
        } else {
          break;
        }
      }
    }
  }

  throw new Error(
    `All AI models failed or are busy. Details: ${lastError?.message || "Unknown error"}`
  );
}

/**
 * Generates structured study flashcards from text.
 */
export async function generateFlashcards(
  sourceText: string,
  count = 8
): Promise<{ question: string; answer: string }[]> {
  const systemInstruction =
    "You are an educational assistant that generates high-quality study flashcards. " +
    "You MUST respond ONLY with a valid JSON array of objects, where each object has 'question' and 'answer' properties. " +
    "Do NOT include markdown formatting or backticks around the JSON output.";

  const prompt = `Generate exactly ${count} clear flashcards based on the following text:\n\n${sourceText}`;

  const rawResult = await generateContentWithFallback(prompt, systemInstruction);

  // Clean JSON response if model wraps output in markdown fences
  const cleanedJson = rawResult
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return JSON.parse(cleanedJson);
}

/**
 * Answers a question grounded in retrieved context chunks.
 *
 * mode "strict"   - answer ONLY using the provided chunks (pure RAG).
 *                    States explicitly if the chunks don't cover it.
 * mode "extended" - answers from the chunks first, then may add general
 *                    knowledge for anything not covered - clearly labeled
 *                    under "Beyond your notes:" so the student always knows
 *                    what's verified against their material vs. not.
 */
export async function answerFromContext(
  question: string,
  contextChunks: string[],
  mode: "strict" | "extended" = "strict"
): Promise<string> {
  const context = contextChunks
    .map((c, i) => `[Excerpt ${i + 1}]\n${c}`)
    .join("\n\n");

  const systemInstruction =
    mode === "strict"
      ? "You are a helpful study assistant. Answer the user's question accurately using ONLY the " +
        "provided context material. If the answer cannot be found in the context, explicitly state " +
        "that the material does not contain enough information."
      : "You are a helpful study assistant. Answer the user's question primarily using the provided " +
        "context material - treat it as the source of truth for anything it covers. If the question " +
        "goes beyond what the context contains, you may add general knowledge to give a fuller answer, " +
        "but you MUST clearly separate the two: answer from the context first, then add a section " +
        "starting with '**Beyond your notes:**' for anything not grounded in the context. Never blend " +
        "the two without that label.";

  const prompt = `Context material:\n${context}\n\nQuestion: ${question}`;

  return await generateContentWithFallback(prompt, systemInstruction);
}