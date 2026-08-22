import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Distinct from /api/flashcards/review (which returns due cards across ALL
// documents for a study session). This returns the full bucket for ONE
// document, regardless of due date - for browsing what's been generated.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const flashcards = await prisma.flashcard.findMany({
    where: { documentId: params.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(flashcards);
}