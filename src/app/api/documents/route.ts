import { NextResponse } from "next/server";
import { chunkText } from "@/lib/chunk";
import { embedBatch } from "@/lib/embeddings";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/documents
 * Fetches all saved documents from the database.
 */
export async function GET() {
  try {
    const documents = await prisma.document.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        createdAt: true,
        _count: {
          select: { chunks: true },
        },
      },
    });

    return NextResponse.json(documents);
  } catch (error: any) {
    console.error("Failed to fetch documents:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch documents" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/documents
 * Processes a new document (chunks it, embeds it, and saves it to DB).
 */
export async function POST(req: Request) {
  try {
    const { title, text } = await req.json();

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: "Document text is empty." }, { status: 400 });
    }

    // 1. Break text into chunks
    const rawChunks = chunkText(text, 800, 150);

    // 2. Generate vector embeddings in safe batches
    const embeddings = await embedBatch(rawChunks, 10);

    // 3. Save document and chunks to Prisma
    const document = await prisma.document.create({
      data: {
        title: title || "Untitled PDF",
        chunks: {
          createMany: {
            data: rawChunks.map((content, index) => ({
              chunkIndex: index,
              content,
              embedding: embeddings[index],
            })),
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      documentId: document.id,
      totalChunks: rawChunks.length,
    });
  } catch (error: any) {
    console.error("Failed to process document:", error);
    return NextResponse.json(
      { error: error.message || "Server Error" },
      { status: 500 }
    );
  }
}