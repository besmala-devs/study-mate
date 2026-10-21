# StudyMate

> **Active Development Notice:** This repository is currently undergoing active improvements, bug fixes, and feature expansions (including quizzes, better error handling, and enhanced UI components).

Upload your notes, generate flashcards and multiple-choice quizzes from them, ask questions that get answered *only* from your own material (RAG), and review due cards on a spaced-repetition schedule (SM-2).

## How it works

1. **Upload** a PDF or `.txt` file. The text is split into overlapping chunks (`lib/chunk.ts`) while keeping line breaks intact so headings and lists aren't glued together.
2. **Embed** each chunk into a vector with Google's embedding model (`lib/embeddings.ts`, via the free Gemini API) and store it in PostgreSQL.
3. **Generate flashcards or quizzes**: a representative slice of the document is sent to Gemini with a system prompt that forces strict JSON output (`lib/ai.ts`).
4. **Ask a question**: the question is embedded, compared against every stored chunk with cosine similarity, and the top 4 matches are sent to Gemini as context (`api/chat/route.ts`). This is Retrieval-Augmented Generation (RAG) — grounded in your notes.
5. **Review**: each flashcard tracks its own spaced-repetition state (repetition count, ease factor, next due date) using a simplified SM-2 algorithm (`lib/srs.ts`).

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS (with Typography plugin) · PostgreSQL + Prisma · Gemini API (generation, RAG answers, embeddings, and quizzes)

The whole stack runs entirely on free tiers:
Supabase (free PostgreSQL) and Google AI Studio (permanent free tier covering generation and embeddings).

## Setup

```bash
npm install
cp .env.example .env       # fill in DATABASE_URL, DIRECT_URL, and GOOGLE_API_KEY
npm run db:push            # creates tables from prisma/schema.prisma
npm run dev
```

## DATABASE_URL & DIRECT_URL: 
Get these from your Supabase project → Project Settings → Database → Connection string (pooled vs direct).

## GOOGLE_API_KEY: 
Get a free key from aistudio.google.com/app/apikey.

## Deploying
Push to GitHub, import the repo on Vercel, add your environment variables in the Vercel project settings, and deploy.

## What this project demonstrates
### Frontend: 
React, Next.js, TypeScript, Tailwind CSS, client-side state management.

### Backend:
REST API design, PostgreSQL schema design, Prisma ORM.

### AI/ML: 
LLM API integration, prompt engineering for structured (JSON) output, Retrieval-Augmented Generation (text embeddings, cosine similarity search, grounded generation), and applied SM-2 spaced repetition algorithms.
