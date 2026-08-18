import { NextResponse } from "next/server";
import { chunkText } from "@/lib/chunk";
import { embedBatch } from "@/lib/embeddings";
import { prisma } from "@/lib/prisma";
const pdfParse = require("pdf-parse");

/**
 * GET /api/documents
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
          select: { chunks: true, flashcards: true },
        },
      },
    });

    return NextResponse.json(documents);
  } catch (error: any) {
    console.error("Failed to fetch documents:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/documents
 * Handles FormData uploads containing PDF or TXT files.
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file was provided in the upload request." }, { status: 400 });
    }

    // 1. Extract text depending on file type (.pdf vs .txt)
    let extractedText = "";
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    if (file.name.endsWith(".pdf")) {
      const pdfData = await pdfParse(buffer);
      extractedText = pdfData.text;
    } else {
      extractedText = buffer.toString("utf-8");
    }

    if (!extractedText || extractedText.trim().length === 0) {
      return NextResponse.json(
        { error: "Could not extract text. The file may be empty or an image-only PDF." },
        { status: 400 }
      );
    }

    // 2. Chunk text into overlapping segments
    const rawChunks = chunkText(extractedText, 800, 150);

    // 3. Generate embeddings in safe batches
    const embeddings = await embedBatch(rawChunks, 10);

    // 4. Save Document & Chunks in Prisma
    const document = await prisma.document.create({
      data: {
        title: file.name,
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
    console.error("Failed to process document upload:", error);
    return NextResponse.json(
      { error: error.message || "Server Error" },
      { status: 500 }
    );
  }
}