# StudyMate

Upload your notes, generate flashcards from them, ask questions that get answered
*only* from your own material, and review due cards on a spaced-repetition schedule.

## How it works

1. **Upload** a PDF or `.txt` file. The text is split into overlapping chunks
   (`lib/chunk.ts`) so no idea gets cut in half at a chunk boundary.
2. **Embed** each chunk into a vector with Google's `text-embedding-004`
   (`lib/embeddings.ts`, via the free Gemini API) and store it in Postgres.
3. **Generate flashcards**: a representative slice of the document is sent to
   Gemini with a system prompt that forces strict JSON output
   (`lib/ai.ts` → `generateFlashcards`).
4. **Ask a question**: the question is embedded, compared against every stored
   chunk with cosine similarity, and the top 4 matches are sent to Gemini as
   the *only* context it's allowed to answer from (`api/chat/route.ts`). This
   is Retrieval-Augmented Generation (RAG) — the answer is grounded in your
   notes, not the model's general knowledge.
5. **Review**: each flashcard tracks its own spaced-repetition state
   (repetition count, ease factor, next due date) using a simplified SM-2
   algorithm — the same algorithm Anki uses (`lib/srs.ts`).

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · PostgreSQL + Prisma ·
Gemini API (generation, RAG answers, and embeddings)

The whole stack runs entirely on free tiers, with no credit card, ever:
Supabase (free Postgres) and Google AI Studio (permanent free tier covering
both generation and embeddings).

## Setup

```bash
npm install
cp .env.example .env      # fill in DATABASE_URL, GOOGLE_API_KEY
npm run db:push           # creates tables from prisma/schema.prisma
npm run dev
```

- **DATABASE_URL**: easiest is a free [Supabase](https://supabase.com) project
  → Project Settings → Database → Connection string.
- **GOOGLE_API_KEY**: [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
  — free tier, no card, no expiration, covers both generation and embeddings.

## Deploying

Push to GitHub, import the repo on [Vercel](https://vercel.com), add the two
env vars in the Vercel project settings, deploy. Free tier is enough for a
portfolio project.

## Known limitations (be upfront about these if asked)

- No authentication yet — all documents are global, not per-user. Adding
  NextAuth with a `userId` on `Document` is the natural next step.
- Embeddings are stored as a plain `Float[]` column and compared with an
  in-memory cosine similarity loop, not `pgvector` — fine at this scale
  (a handful of documents), but wouldn't scale to thousands of chunks
  without a real vector index.
- Flashcard generation always reads the first ~12 chunks of a document,
  not the whole thing — keeps token cost predictable but means very long
  documents won't be fully covered yet.
- Single-provider (Gemini) for both generation and embeddings — simpler to
  run, but means the whole AI layer depends on one vendor's uptime/quota.

## What this project demonstrates

Frontend: React, Next.js, TypeScript, Tailwind, client-side state management.
Backend: REST API design, PostgreSQL schema design, Prisma ORM.
AI/ML: LLM API integration, prompt engineering for structured (JSON) output,
Retrieval-Augmented Generation — text embeddings, cosine similarity search,
grounded generation. Applied algorithms: simplified SM-2 spaced repetition.
