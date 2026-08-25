import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH /api/documents/[id]  { collectionId: "xxx" | null }
// Moves a document into a collection, or back to ungrouped with null.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { collectionId } = await req.json().catch(() => ({}));

  const document = await prisma.document.update({
    where: { id: params.id },
    data: { collectionId: collectionId || null },
  });

  return NextResponse.json(document);
}