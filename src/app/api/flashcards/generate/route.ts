import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateFlashcards } from "@/lib/ai";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { documentId, count: requestedCount } = body;

    if (!documentId) {
      return NextResponse.json({ error: "documentId is required" }, { status: 400 });
    }

    // 1. Fetch ALL chunks of the document in order
    const chunks = await prisma.chunk.findMany({
      where: { documentId },
      orderBy: { chunkIndex: "asc" },
    });

    if (chunks.length === 0) {
      return NextResponse.json({ error: "Document has no processed content" }, { status: 404 });
    }

    // 2. Decide how many cards: use the number sent, otherwise scale with document size
    const parsedCount = Number(requestedCount);
    const targetCount =
      Number.isFinite(parsedCount) && parsedCount > 0
        ? Math.min(60, Math.round(parsedCount))
        : Math.min(40, Math.max(6, Math.round(chunks.length * 0.5)));

    // 3. Read across the ENTIRE document
    const sourceText = chunks.map((c) => c.content).join("\n\n");

    // 4. Ask the AI
    const generated = await generateFlashcards(sourceText, targetCount);

    // 5. Skip questions that already exist for this document
    const existing = await prisma.flashcard.findMany({
      where: { documentId },
      select: { question: true },
    });
    const existingQuestions = new Set(existing.map((e) => e.question.trim().toLowerCase()));
    const fresh = generated.filter(
      (card) => !existingQuestions.has(card.question.trim().toLowerCase())
    );

    if (fresh.length === 0) {
      return NextResponse.json({
        flashcards: [],
        totalChunks: chunks.length,
        generatedCount: 0,
        message: "All generated cards already existed.",
      });
    }

    // 6. Save
    const created = await prisma.$transaction(
      fresh.map((card) =>
        prisma.flashcard.create({
          data: { documentId, question: card.question, answer: card.answer },
        })
      )
    );

    return NextResponse.json({
      flashcards: created,
      totalChunks: chunks.length,
      generatedCount: created.length,
    });
  } catch (error: any) {
    console.error("Failed to generate flashcards:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to generate flashcards" },
      { status: 500 }
    );
  }
}