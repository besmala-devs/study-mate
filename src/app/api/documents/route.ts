import { NextRequest, NextResponse } from "next/server";
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
 * Optional ?collectionId=xxx to filter to one collection.
 * Optional ?collectionId=none to get only ungrouped documents.
 */
export async function GET(req: NextRequest) {
  try {
    const collectionId = req.nextUrl.searchParams.get("collectionId");

    const where =
      collectionId === "none"
        ? { collectionId: null }
        : collectionId
        ? { collectionId }
        : {};

    const documents = await prisma.document.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        createdAt: true,
        collectionId: true,
        collection: { select: { id: true, name: true } },
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
 * Accepts an optional "collectionId" field in the form data to file the
 * upload directly into a group. Omit it (or "") to leave it ungrouped.
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const collectionIdRaw = formData.get("collectionId");
    const collectionId =
      typeof collectionIdRaw === "string" && collectionIdRaw.trim() ? collectionIdRaw : null;

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
      try {
        const pdfData = new Uint8Array(bytes);
        const { text, totalPages } = await extractText(pdfData, { mergePages: true });
        
        console.log(`Processing PDF: ${totalPages} pages found.`);

        if (Array.isArray(text)) {
          extractedText = text.join("\n");
        } else if (typeof text === "string") {
          extractedText = text;
        }
      } catch (pdfErr: any) {
        console.error("PDF Parsing Error:", pdfErr);
      }
    } else {
      const buffer = Buffer.from(bytes);
      extractedText = buffer.toString("utf-8");
    }

    console.log("Raw extracted characters count:", extractedText.length);

    // 🛠️ Sanitize extracted text
    const cleanText = sanitizeText(extractedText);
    console.log("Sanitized characters count:", cleanText.length);

    // Fallback: If sanitizeText wiped out text due to strict font encodings, keep printable text
    extractedText = cleanText.trim().length > 0 ? cleanText : extractedText.replace(/\u0000/g, "");

    if (!extractedText || extractedText.trim().length === 0) {
      return NextResponse.json(
        { error: "Could not extract text. The file may be empty, encrypted, or a scanned image PDF." },
        { status: 400 }
      );
    }

    // 2. Chunk text into overlapping segments
    const rawChunks = chunkText(extractedText, 1500, 200).map(sanitizeText);

    // 3. Generate embeddings in safe batches
    const embeddings = await embedBatch(rawChunks);

    // 4. Save Document & Chunks in Prisma
    const document = await prisma.document.create({
      data: {
        title: file.name,
        collectionId,
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