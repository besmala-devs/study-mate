/**
 * Splits raw text into overlapping chunks while preserving word boundaries.
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
    let end = start + chunkSize;

    // Break at the nearest space instead of cutting words in half
    if (end < clean.length) {
      const lastSpace = clean.lastIndexOf(" ", end);
      if (lastSpace > start) {
        end = lastSpace;
      }
    } else {
      end = clean.length;
    }

    const chunk = clean.slice(start, end).trim();
    if (chunk) chunks.push(chunk);

    if (end >= clean.length) break;

    // Overlap at a word boundary
    let nextStart = end - overlap;
    const nextSpace = clean.indexOf(" ", nextStart);
    if (nextSpace !== -1 && nextSpace < end) {
      nextStart = nextSpace + 1;
    }

    // Safeguard to ensure start always advances
    start = nextStart > start ? nextStart : end;
  }

  return chunks;
}