import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/collections - list all collections, with a document count each
export async function GET() {
  const collections = await prisma.collection.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      _count: { select: { documents: true } },
    },
  });
  return NextResponse.json(collections);
}

// POST /api/collections - create a new collection, e.g. { name: "Thermodynamics" }
export async function POST(req: NextRequest) {
  const { name } = await req.json().catch(() => ({}));
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const collection = await prisma.collection.create({ data: { name: name.trim() } });
  return NextResponse.json(collection);
}