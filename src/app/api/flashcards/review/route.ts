import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { scheduleNext } from "@/lib/srs";

export async function GET() {
  // Cards due for review right now, across all documents.
  const due = await prisma.flashcard.findMany({
    where: { dueAt: { lte: new Date() } },
    orderBy: { dueAt: "asc" },
    take: 20,
    include: { document: { select: { title: true } } },
  });
  return NextResponse.json(due);
}

export async function POST(req: NextRequest) {
  const { flashcardId, quality } = await req.json();

  if (!flashcardId || quality === undefined) {
    return NextResponse.json({ error: "flashcardId and quality (0-5) are required" }, { status: 400 });
  }

  const card = await prisma.flashcard.findUnique({ where: { id: flashcardId } });
  if (!card) return NextResponse.json({ error: "Flashcard not found" }, { status: 404 });

  const next = scheduleNext(quality, {
    repetition: card.repetition,
    easeFactor: card.easeFactor,
    intervalDays: card.intervalDays,
  });

  const updated = await prisma.flashcard.update({
    where: { id: flashcardId },
    data: next,
  });

  return NextResponse.json(updated);
}
