/**
 * Splits raw text into overlapping chunks suitable for embedding + retrieval.
 *
 * Why overlap? If a sentence that answers a question gets cut in half between
 * two chunks, neither chunk alone may retrieve well. A small overlap means
 * each idea is fully contained in at least one chunk.
 */
export function chunkText(
  text: string,
  chunkSize = 800,
  overlap = 150
): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < clean.length) {
    const end = Math.min(start + chunkSize, clean.length);
    chunks.push(clean.slice(start, end));
    if (end === clean.length) break;
    start = end - overlap;
  }

  return chunks;
}
