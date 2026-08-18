import { GoogleGenerativeAI } from "@google/generative-ai";

// Everything in this file runs on Google's free Gemini tier - no card, no
// expiration. Using one provider for both generation and embeddings keeps
// the project's cost story simple: $0, indefinitely, at this scale.
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
const MODEL = "gemini-2.5-flash";

export type GeneratedFlashcard = { question: string; answer: string };

/**
 * Ask Gemini to turn a chunk of study material into flashcards.
 * We force strict JSON output so it can be parsed and stored directly -
 * no manual copy-pasting, this is what makes it a "generation" feature
 * rather than a chat wrapper.
 */
export async function generateFlashcards(
  sourceText: string,
  count = 5
): Promise<GeneratedFlashcard[]> {
  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction:
      "You are a study assistant. Given source material, produce concise flashcards " +
      "that test understanding, not just recall of exact wording. " +
      "Respond with ONLY a JSON array, no markdown fences, no preamble. " +
      'Format: [{"question": "...", "answer": "..."}]',
    generationConfig: { responseMimeType: "application/json" },
  });

  const result = await model.generateContent(
    `Create ${count} flashcards from this material:\n\n${sourceText}`
  );

  const raw = result.response.text();

  try {
    return JSON.parse(raw.trim());
  } catch {
    // Model occasionally wraps output in fences despite instructions - strip and retry once.
    const cleaned = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  }
}

/**
 * Answer a question using ONLY the retrieved chunks as context (RAG).
 * This is what keeps answers grounded in the user's own notes instead of
 * the model's general knowledge / hallucination.
 */
export async function answerFromContext(
  question: string,
  contextChunks: string[]
): Promise<string> {
  const context = contextChunks.map((c, i) => `[Excerpt ${i + 1}]\n${c}`).join("\n\n");

  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction:
      "Answer the user's question using ONLY the excerpts provided below. " +
      "If the excerpts don't contain the answer, say so explicitly rather than guessing.",
  });

  const result = await model.generateContent(
    `Excerpts from my notes:\n\n${context}\n\nQuestion: ${question}`
  );

  return result.response.text();
}
