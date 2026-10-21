import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scheduleNext } from "@/lib/srs";

export async function GET() {
  try {
    // Cards due for review right now, across all documents.
    const due = await prisma.flashcard.findMany({
      where: { dueAt: { lte: new Date() } },
      orderBy: { dueAt: "asc" },
      take: 20,
      include: { document: { select: { title: true } } },
    });
    return NextResponse.json(due);
  } catch (error: any) {
    console.error("Failed to load due cards:", error);
    return NextResponse.json({ error: error?.message || "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { flashcardId, quality } = body;

    if (
      !flashcardId ||
      typeof quality !== "number" ||
      !Number.isInteger(quality) ||
      quality < 0 ||
      quality > 5
    ) {
      return NextResponse.json(
        { error: "flashcardId and an integer quality from 0 to 5 are required" },
        { status: 400 }
      );
    }

    const card = await prisma.flashcard.findUnique({ where: { id: flashcardId } });
    if (!card) {
      return NextResponse.json({ error: "Flashcard not found" }, { status: 404 });
    }

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
  } catch (error: any) {
    console.error("Failed to save review:", error);
    return NextResponse.json({ error: error?.message || "Server error" }, { status: 500 });
  }
}