"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Doc = { id: string; title: string; _count: { chunks: number; flashcards: number } };
type DueCard = { id: string; question: string; answer: string; document: { title: string } };
type DocFlashcard = { id: string; question: string; answer: string; repetition: number; dueAt: string };
type ChatMessage = { role: "user" | "assistant"; content: string };

export default function Home() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Chat is a running thread per document, not a single overwritten answer.
  // Kept purely client-side for now - each request still only sends the
  // latest question to the backend (no multi-turn context yet); that's a
  // deliberate follow-up, not done here.
  const [chatByDoc, setChatByDoc] = useState<Record<string, ChatMessage[]>>({});
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Due-today study queue (spaced repetition, across all documents)
  const [dueCards, setDueCards] = useState<DueCard[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  // Browse-by-document flashcard bucket
  const [flashcardsView, setFlashcardsView] = useState<"study" | "browse">("study");
  const [docFlashcards, setDocFlashcards] = useState<DocFlashcard[]>([]);
  const [loadingDocCards, setLoadingDocCards] = useState(false);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);

  const messages = activeDocId ? chatByDoc[activeDocId] ?? [] : [];

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

  async function loadDocFlashcards(docId: string) {
    setLoadingDocCards(true);
    const res = await fetch(`/api/documents/${docId}/flashcards`);
    setDocFlashcards(await res.json());
    setLoadingDocCards(false);
    setExpandedCardId(null);
  }

  useEffect(() => {
    loadDocs();
    loadDue();
  }, []);

  useEffect(() => {
    if (activeDocId && flashcardsView === "browse") {
      loadDocFlashcards(activeDocId);
    }
  }, [activeDocId, flashcardsView]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, asking]);

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
    const docId = activeDocId;
    const userMessage: ChatMessage = { role: "user", content: question };

    setChatByDoc((prev) => ({ ...prev, [docId]: [...(prev[docId] ?? []), userMessage] }));
    setQuestion("");
    setAsking(true);

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: docId, question: userMessage.content }),
    });
    const data = await res.json();
    const assistantMessage: ChatMessage = {
      role: "assistant",
      content: data.answer ?? "Something went wrong.",
    };
    setChatByDoc((prev) => ({ ...prev, [docId]: [...(prev[docId] ?? []), assistantMessage] }));
    setAsking(false);
  }

  function clearChat() {
    if (!activeDocId) return;
    setChatByDoc((prev) => ({ ...prev, [activeDocId]: [] }));
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
    if (flashcardsView === "browse") loadDocFlashcards(activeDocId);
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
  const activeDoc = docs.find((d) => d.id === activeDocId);

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

        {/* RAG chat - threaded, markdown-rendered */}
        <section className="flex flex-col rounded-lg border border-ink/10 bg-white/60 p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">2. Ask your notes</h2>
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="font-mono text-[11px] uppercase tracking-wide text-ink/40 hover:text-ink/70"
              >
                Clear
              </button>
            )}
          </div>
          <p className="mt-1 text-sm text-ink/60">
            Answers are grounded only in {activeDoc ? `"${activeDoc.title}"` : "the selected document"}, not general knowledge.
          </p>

          <div className="mt-4 h-72 space-y-3 overflow-y-auto rounded-md border border-ink/10 bg-paper p-3">
            {messages.length === 0 && (
              <p className="text-sm text-ink/40">
                {activeDocId ? "Ask something to start the conversation." : "Select a document first."}
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`rounded-md px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "ml-6 bg-accentSoft text-ink"
                    : "mr-6 border border-ink/10 bg-white"
                }`}
              >
                {m.role === "assistant" ? (
                  <div className="prose prose-sm max-w-none prose-p:my-1.5 prose-headings:font-display prose-headings:my-2 prose-ul:my-1.5 prose-ol:my-1.5 prose-pre:bg-ink prose-pre:text-paper">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="font-medium">{m.content}</p>
                )}
              </div>
            ))}
            {asking && <p className="mr-6 text-sm text-ink/40">Thinking…</p>}
            <div ref={chatEndRef} />
          </div>

          <div className="mt-3 flex gap-2">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleAsk();
                }
              }}
              disabled={!activeDocId}
              placeholder={activeDocId ? "e.g. What causes seasonality in the data?" : "Select a document first"}
              className="h-16 flex-1 resize-none rounded-md border border-ink/15 bg-white p-3 text-sm outline-none focus:border-accent disabled:opacity-50"
            />
            <button
              onClick={handleAsk}
              disabled={!activeDocId || asking || !question.trim()}
              className="self-end rounded-md bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-ink/85 disabled:opacity-50"
            >
              {asking ? "…" : "Ask"}
            </button>
          </div>
        </section>

        {/* Flashcards: study session (due today) vs browse-by-document */}
        <section className="rounded-lg border border-ink/10 bg-white/60 p-6">
          <div className="flex items-center gap-1 rounded-md bg-ink/5 p-1">
            <button
              onClick={() => setFlashcardsView("study")}
              className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition ${
                flashcardsView === "study" ? "bg-white shadow-sm" : "text-ink/50 hover:text-ink"
              }`}
            >
              Study session
            </button>
            <button
              onClick={() => setFlashcardsView("browse")}
              className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition ${
                flashcardsView === "browse" ? "bg-white shadow-sm" : "text-ink/50 hover:text-ink"
              }`}
            >
              Browse by document
            </button>
          </div>

          {flashcardsView === "study" ? (
            <>
              <p className="mt-4 text-sm text-ink/60">{dueCards.length} card(s) due right now, across all documents.</p>
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
            </>
          ) : (
            <>
              {!activeDocId ? (
                <p className="mt-4 rounded-md border border-dashed border-ink/15 p-5 text-sm text-ink/50">
                  Select a document on the left to see its flashcards.
                </p>
              ) : loadingDocCards ? (
                <p className="mt-4 text-sm text-ink/40">Loading…</p>
              ) : docFlashcards.length === 0 ? (
                <p className="mt-4 rounded-md border border-dashed border-ink/15 p-5 text-sm text-ink/50">
                  No flashcards for "{activeDoc?.title}" yet — generate some from the left panel.
                </p>
              ) : (
                <>
                  <p className="mt-4 text-sm text-ink/60">
                    {docFlashcards.length} card(s) in "{activeDoc?.title}".
                  </p>
                  <ul className="mt-3 max-h-96 space-y-2 overflow-y-auto">
                    {docFlashcards.map((c) => {
                      const isOpen = expandedCardId === c.id;
                      return (
                        <li key={c.id}>
                          <button
                            onClick={() => setExpandedCardId(isOpen ? null : c.id)}
                            className="w-full rounded-md border border-ink/10 bg-paper px-3 py-2 text-left text-sm transition hover:border-ink/25"
                          >
                            <p className="font-medium">{c.question}</p>
                            {isOpen && (
                              <p className="mt-2 border-t border-ink/10 pt-2 text-ink/75">{c.answer}</p>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}