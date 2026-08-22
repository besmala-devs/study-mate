import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateFlashcards } from "@/lib/ai";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { documentId, count: requestedCount } = body;

  if (!documentId) {
    return NextResponse.json({ error: "documentId is required" }, { status: 400 });
  }

  // 1. Fetch ALL chunks in order
  const chunks = await prisma.chunk.findMany({
    where: { documentId },
    orderBy: { chunkIndex: "asc" },
  });

  if (chunks.length === 0) {
    return NextResponse.json({ error: "Document has no processed content" }, { status: 404 });
  }

  // 2. Dynamically calculate flashcard count based on document size if not explicitly specified
  // Examples: 11 chunks -> ~8 cards | 70 chunks -> ~35 cards
  const targetCount = requestedCount 
    ? Number(requestedCount)
    : Math.min(40, Math.max(6, Math.round(chunks.length * 0.5)));

  // 3. Read across the ENTIRE document (no more slicing at 12!)
  const sourceText = chunks.map((c) => c.content).join("\n\n");

  // 4. Generate the proportional amount of flashcards
  const generated = await generateFlashcards(sourceText, targetCount);

  // 5. Save generated flashcards in database
  const created = await prisma.$transaction(
    generated.map((card) =>
      prisma.flashcard.create({
        data: {
          documentId,
          question: card.question,
          answer: card.answer,
        },
      })
    )
  );

  return NextResponse.json({ 
    flashcards: created,
    totalChunks: chunks.length,
    generatedCount: created.length 
  });
}