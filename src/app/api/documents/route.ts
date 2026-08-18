import { NextResponse } from "next/server";
import { extractText } from "unpdf";
import { chunkText } from "@/lib/chunk";
import { embedBatch } from "@/lib/embeddings";
import { prisma } from "@/lib/prisma";

// Helper function to strip null bytes and invalid UTF-8 control characters
function sanitizeText(text: string): string {
  return text
    .replace(/\u0000/g, "") // Remove NULL bytes (0x00)
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, ""); // Remove non-printable ASCII control chars
}

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
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file was provided in the upload request." },
        { status: 400 }
      );
    }

    // 1. Extract text depending on file type (.pdf vs .txt)
    let extractedText = "";
    const bytes = await file.arrayBuffer();

    if (file.name.toLowerCase().endsWith(".pdf")) {
      // unpdf accepts Uint8Array directly
      const { text } = await extractText(new Uint8Array(bytes));
      extractedText = Array.isArray(text) ? text.join("\n") : text;
    } else {
      const buffer = Buffer.from(bytes);
      extractedText = buffer.toString("utf-8");
    }

    // 🛠️ STEP 1: Sanitize extracted full text right away
    extractedText = sanitizeText(extractedText);

    if (!extractedText || extractedText.trim().length === 0) {
      return NextResponse.json(
        { error: "Could not extract text. The file may be empty or an image-only PDF." },
        { status: 400 }
      );
    }

    // 2. Chunk text into overlapping segments & sanitize each chunk
    const rawChunks = chunkText(extractedText, 1500, 200).map(sanitizeText); // 🛠️ STEP 2: Ensure chunks are clean

    // 3. Generate embeddings in safe batches
    const embeddings = await embedBatch(rawChunks);

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