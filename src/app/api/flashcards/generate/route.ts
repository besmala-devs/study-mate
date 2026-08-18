import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateFlashcards } from "@/lib/ai";

export async function POST(req: NextRequest) {
  const { documentId, count = 8 } = await req.json();

  if (!documentId) {
    return NextResponse.json({ error: "documentId is required" }, { status: 400 });
  }

  const chunks = await prisma.chunk.findMany({
    where: { documentId },
    orderBy: { chunkIndex: "asc" },
  });

  if (chunks.length === 0) {
    return NextResponse.json({ error: "Document has no processed content" }, { status: 404 });
  }

  // For an MVP, feed a representative slice of the document rather than everything -
  // keeps token usage predictable regardless of document length.
  const sourceText = chunks
    .slice(0, 12)
    .map((c) => c.content)
    .join("\n\n");

  const generated = await generateFlashcards(sourceText, count);

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

  return NextResponse.json({ flashcards: created });
}
