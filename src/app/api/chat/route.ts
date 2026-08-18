import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { embedText, topKByCosineSimilarity } from "@/lib/embeddings";
import { answerFromContext } from "@/lib/ai";

export async function POST(req: NextRequest) {
  const { documentId, question } = await req.json();

  if (!documentId || !question) {
    return NextResponse.json({ error: "documentId and question are required" }, { status: 400 });
  }

  const chunks = await prisma.chunk.findMany({ where: { documentId } });
  if (chunks.length === 0) {
    return NextResponse.json({ error: "Document has no processed content" }, { status: 404 });
  }

  // 1. Embed the question in the same vector space as the stored chunks
  const questionEmbedding = await embedText(question);

  // 2. Retrieve the most semantically relevant chunks (the "R" in RAG)
  const topMatches = topKByCosineSimilarity(questionEmbedding, chunks, 4);

  // 3. Generate an answer grounded only in those chunks (the "G" in RAG)
  const answer = await answerFromContext(
    question,
    topMatches.map((m) => m.content)
  );

  return NextResponse.json({
    answer,
    sources: topMatches.map((m) => ({ chunkIndex: m.chunkIndex, score: m.score })),
  });
}
