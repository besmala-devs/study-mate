import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) {
  throw new Error("GOOGLE_API_KEY environment variable is required.");
}

const ai = new GoogleGenAI({ apiKey });

// Use gemini-flash-latest to safely target active models automatically
const MODELS_TO_TRY = ["gemini-flash-latest", "gemini-2.0-flash"];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type GenerateOptions = {
  systemInstruction?: string;
  json?: boolean; // ask Gemini to return valid JSON
};

/**
 * Calls Gemini with retries and model fallback.
 * Every attempt is counted, so it can never loop forever.
 */
async function generateContentWithFallback(
  prompt: string,
  options: GenerateOptions = {}
): Promise<string> {
  let lastError: any = null;

  for (const modelName of MODELS_TO_TRY) {
    let attemptsLeft = 3;
    let delay = 3000;

    while (attemptsLeft > 0) {
      attemptsLeft--; // <-- counted on EVERY attempt (this fixes the infinite loop)

      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            ...(options.systemInstruction
              ? { systemInstruction: options.systemInstruction }
              : {}),
            ...(options.json ? { responseMimeType: "application/json" } : {}),
          },
        });

        if (response.text) {
          return response.text;
        }
        lastError = new Error(`[${modelName}] returned an empty response`);
      } catch (error: any) {
        lastError = error;
        console.warn(`[${modelName}] Attempt failed (${error?.message || error}).`);

        // Model doesn't exist: skip straight to the next model.
        if (error?.status === 404 || error?.message?.includes("404")) {
          break;
        }
      }

      if (attemptsLeft > 0) {
        await sleep(delay);
        delay *= 2; // wait longer each time (exponential backoff)
      }
    }
  }

  throw new Error(
    `All AI models failed or are busy. Details: ${lastError?.message || "Unknown error"}`
  );
}

/** Removes ```json fences if the model adds them, then parses JSON. */
function parseJson(raw: string): unknown {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

/* ------------------------------------------------------------------ */
/* Flashcards                                                          */
/* ------------------------------------------------------------------ */

export type FlashcardData = { question: string; answer: string };

export async function generateFlashcards(
  sourceText: string,
  count = 8
): Promise<FlashcardData[]> {
  const systemInstruction =
    "You are an educational assistant that generates high-quality study flashcards. " +
    "You MUST respond ONLY with a valid JSON array of objects, where each object has " +
    "'question' and 'answer' string properties. " +
    "Base every card strictly on the provided text.";

  const prompt = `Generate exactly ${count} clear flashcards based on the following text:\n\n${sourceText}`;

  // Try up to 2 times in case the model returns a bad format.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const raw = await generateContentWithFallback(prompt, {
      systemInstruction,
      json: true,
    });

    try {
      const parsed = parseJson(raw);
      if (Array.isArray(parsed)) {
        const cards = parsed
          .filter(
            (c: any) =>
              c &&
              typeof c.question === "string" &&
              typeof c.answer === "string" &&
              c.question.trim() &&
              c.answer.trim()
          )
          .map((c: any) => ({
            question: c.question.trim(),
            answer: c.answer.trim(),
          }));
        if (cards.length > 0) return cards;
      }
    } catch {
      // fall through and retry
    }
    console.warn(`Flashcard JSON was invalid (attempt ${attempt}/2).`);
  }

  throw new Error("The AI returned an invalid flashcard format. Please try again.");
}

/* ------------------------------------------------------------------ */
/* Quiz (NEW)                                                          */
/* ------------------------------------------------------------------ */

export type QuizQuestionData = {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

export async function generateQuiz(
  sourceText: string,
  count = 8
): Promise<QuizQuestionData[]> {
  const systemInstruction =
    "You are an educational assistant that writes multiple-choice quiz questions for students. " +
    "Respond ONLY with a valid JSON array. Each item must have: " +
    "'question' (string), " +
    "'options' (array of exactly 4 different strings), " +
    "'correctIndex' (integer from 0 to 3: the position of the correct option in 'options'), " +
    "'explanation' (one or two sentences explaining why the correct option is right). " +
    "Base every question strictly on the provided text. " +
    "Spread the correct answers across different positions.";

  const prompt = `Write exactly ${count} multiple-choice questions based on the following text:\n\n${sourceText}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const raw = await generateContentWithFallback(prompt, {
      systemInstruction,
      json: true,
    });

    try {
      const parsed = parseJson(raw);
      if (Array.isArray(parsed)) {
        const questions = parsed
          .filter(
            (q: any) =>
              q &&
              typeof q.question === "string" &&
              q.question.trim() &&
              Array.isArray(q.options) &&
              q.options.length === 4 &&
              q.options.every((o: any) => typeof o === "string" && o.trim()) &&
              Number.isInteger(q.correctIndex) &&
              q.correctIndex >= 0 &&
              q.correctIndex <= 3 &&
              typeof q.explanation === "string"
          )
          .map((q: any) => ({
            question: q.question.trim(),
            options: q.options.map((o: string) => o.trim()),
            correctIndex: q.correctIndex,
            explanation: q.explanation.trim(),
          }));
        if (questions.length > 0) return questions;
      }
    } catch {
      // fall through and retry
    }
    console.warn(`Quiz JSON was invalid (attempt ${attempt}/2).`);
  }

  throw new Error("The AI returned an invalid quiz format. Please try again.");
}

/* ------------------------------------------------------------------ */
/* Chat (RAG answers)                                                  */
/* ------------------------------------------------------------------ */

/**
 * mode "strict"   - answer ONLY from the provided chunks.
 * mode "extended" - answer from the chunks first, then add general knowledge
 *                   under "**Beyond your notes:**".
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

  return await generateContentWithFallback(prompt, { systemInstruction });
}