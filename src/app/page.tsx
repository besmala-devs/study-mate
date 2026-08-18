"use client";

import { useEffect, useState } from "react";

type Doc = { id: string; title: string; _count: { chunks: number; flashcards: number } };
type DueCard = { id: string; question: string; answer: string; document: { title: string } };

export default function Home() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const [dueCards, setDueCards] = useState<DueCard[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function loadDocs() {
    const res = await fetch("/api/documents");
    setDocs(await res.json());
  }

  async function loadDue() {
    const res = await fetch("/api/flashcards/review");
    setDueCards(await res.json());
    setReviewIndex(0);
    setShowAnswer(false);
  }

  useEffect(() => {
    loadDocs();
    loadDue();
  }, []);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/documents", { method: "POST", body: formData });
    const data = await res.json();
    setUploading(false);
    if (data.documentId) {
      setActiveDocId(data.documentId);
      loadDocs();
    }
  }

  async function handleAsk() {
    if (!activeDocId || !question.trim()) return;
    setAsking(true);
    setAnswer(null);
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: activeDocId, question }),
    });
    const data = await res.json();
    setAnswer(data.answer ?? "Something went wrong.");
    setAsking(false);
  }

  async function handleGenerate() {
    if (!activeDocId) return;
    setGenerating(true);
    await fetch("/api/flashcards/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: activeDocId, count: 8 }),
    });
    setGenerating(false);
    loadDocs();
    loadDue();
  }

  async function handleReview(quality: number) {
    const card = dueCards[reviewIndex];
    if (!card) return;
    await fetch("/api/flashcards/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flashcardId: card.id, quality }),
    });
    setShowAnswer(false);
    setReviewIndex((i) => i + 1);
  }

  const currentCard = dueCards[reviewIndex];

  return (
    <main className="min-h-screen px-6 py-12 md:px-16">
      <header className="mb-14 max-w-2xl">
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-accent">studymate</p>
        <h1 className="font-display text-4xl font-semibold leading-tight md:text-5xl">
          Turn your notes into things you'll actually remember.
        </h1>
        <p className="mt-3 text-ink/70">
          Upload material, generate flashcards, ask questions answered only from what you gave it.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
        {/* Upload + document list */}
        <section className="rounded-lg border border-ink/10 bg-white/60 p-6">
          <h2 className="font-display text-lg font-semibold">1. Add material</h2>
          <label className="mt-4 block cursor-pointer rounded-md border border-dashed border-accent/40 bg-accentSoft px-4 py-6 text-center text-sm text-accent transition hover:bg-accentSoft/70">
            {uploading ? "Processing…" : "Upload a PDF or .txt file"}
            <input type="file" accept=".pdf,.txt" className="hidden" onChange={handleUpload} />
          </label>

          <ul className="mt-6 space-y-2">
            {docs.map((d) => (
              <li key={d.id}>
                <button
                  onClick={() => setActiveDocId(d.id)}
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                    activeDocId === d.id
                      ? "border-accent bg-accentSoft"
                      : "border-ink/10 hover:border-ink/25"
                  }`}
                >
                  <div className="truncate font-medium">{d.title}</div>
                  <div className="font-mono text-xs text-ink/50">
                    {d._count.chunks} chunks · {d._count.flashcards} cards
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {activeDocId && (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="mt-6 w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent/90 disabled:opacity-50"
            >
              {generating ? "Generating…" : "Generate flashcards"}
            </button>
          )}
        </section>

        {/* RAG chat */}
        <section className="rounded-lg border border-ink/10 bg-white/60 p-6">
          <h2 className="font-display text-lg font-semibold">2. Ask your notes</h2>
          <p className="mt-1 text-sm text-ink/60">
            Answers are grounded only in the selected document, not general knowledge.
          </p>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={!activeDocId}
            placeholder={activeDocId ? "e.g. What causes seasonality in the data?" : "Select a document first"}
            className="mt-4 h-24 w-full rounded-md border border-ink/15 bg-white p-3 text-sm outline-none focus:border-accent disabled:opacity-50"
          />
          <button
            onClick={handleAsk}
            disabled={!activeDocId || asking || !question.trim()}
            className="mt-3 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-ink/85 disabled:opacity-50"
          >
            {asking ? "Thinking…" : "Ask"}
          </button>

          {answer && (
            <div className="mt-4 rounded-md border border-ink/10 bg-paper p-4 text-sm leading-relaxed">
              {answer}
            </div>
          )}
        </section>

        {/* Spaced-repetition review */}
        <section className="rounded-lg border border-ink/10 bg-white/60 p-6">
          <h2 className="font-display text-lg font-semibold">3. Review due cards</h2>
          <p className="mt-1 text-sm text-ink/60">{dueCards.length} card(s) due right now.</p>

          {currentCard ? (
            <div className="mt-4 rounded-md border border-ink/15 bg-paper p-5">
              <p className="font-mono text-[11px] uppercase tracking-wide text-ink/40">
                {currentCard.document.title}
              </p>
              <p className="mt-2 font-medium">{currentCard.question}</p>

              {showAnswer ? (
                <>
                  <p className="mt-3 border-t border-ink/10 pt-3 text-sm text-ink/80">{currentCard.answer}</p>
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => handleReview(1)}
                      className="flex-1 rounded-md border border-warn/40 px-3 py-2 text-xs font-medium text-warn hover:bg-warn/5"
                    >
                      Forgot
                    </button>
                    <button
                      onClick={() => handleReview(3)}
                      className="flex-1 rounded-md border border-ink/20 px-3 py-2 text-xs font-medium hover:bg-ink/5"
                    >
                      Hard
                    </button>
                    <button
                      onClick={() => handleReview(5)}
                      className="flex-1 rounded-md border border-accent/40 px-3 py-2 text-xs font-medium text-accent hover:bg-accentSoft"
                    >
                      Easy
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={() => setShowAnswer(true)}
                  className="mt-4 w-full rounded-md bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent/90"
                >
                  Show answer
                </button>
              )}
            </div>
          ) : (
            <p className="mt-4 rounded-md border border-dashed border-ink/15 p-5 text-sm text-ink/50">
              Nothing due. Generate cards from a document, or come back later.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
