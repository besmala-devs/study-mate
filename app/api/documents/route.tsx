import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chunkText } from "@/lib/chunk";
import { embedBatch } from "@/lib/embeddings";

// pdf-parse is CommonJS and touches the filesystem on import in some setups -
// requiring it lazily avoids issues with Next's server bundling.
async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfParse = (await import("pdf-parse")).default;
  const data = await pdfParse(buffer);
  return data.text;
}

export async function GET() {
  const documents = await prisma.document.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, createdAt: true, _count: { select: { chunks: true, flashcards: true } } },
  });
  return NextResponse.json(documents);
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const text = file.type === "application/pdf" ? await extractPdfText(buffer) : buffer.toString("utf-8");

  if (!text || text.trim().length < 20) {
    return NextResponse.json({ error: "Couldn't extract usable text from this file" }, { status: 400 });
  }

  const document = await prisma.document.create({
    data: { title: file.name },
  });

  const pieces = chunkText(text);
  const embeddings = await embedBatch(pieces);

  await prisma.chunk.createMany({
    data: pieces.map((content, i) => ({
      documentId: document.id,
      content,
      embedding: embeddings[i],
      chunkIndex: i,
    })),
  });

  return NextResponse.json({ documentId: document.id, chunkCount: pieces.length });
}
