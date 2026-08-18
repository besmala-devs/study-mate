import { GoogleGenerativeAI } from "@google/generative-ai";

// Updated from deprecated gemini-2.5-flash
const MODEL = "gemini-3.5-flash";

export type GeneratedFlashcard = { question: string; answer: string };

/**
 * Ask Gemini to turn a chunk of study material into flashcards.
 */
export async function generateFlashcards(
  sourceText: string,
  count = 5
): Promise<GeneratedFlashcard[]> {
  const model = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!).getGenerativeModel({
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
    // Strip markdown code block fences if present and retry
    const cleaned = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  }
}

/**
 * Answer a question using ONLY the retrieved chunks as context (RAG).
 */
export async function answerFromContext(
  question: string,
  contextChunks: string[]
): Promise<string> {
  const context = contextChunks.map((c, i) => `[Excerpt ${i + 1}]\n${c}`).join("\n\n");

  const model = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!).getGenerativeModel({
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