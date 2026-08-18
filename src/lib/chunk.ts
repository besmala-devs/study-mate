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

    if (end < clean.length) {
      const lastSpace = clean.lastIndexOf(" ", end);
      if (lastSpace > start) {
        end = lastSpace;
      }
    } else {
      end = clean.length;
    }

    const chunk = clean.slice(start, end).trim();

    // 🛑 Filter out useless page-number strings like "-- 1 of 58 --"
    const isOnlyPageNumbers = /^(--\s*\d+\s*of\s*\d+\s*--\s*)+$/i.test(chunk);

    if (chunk && !isOnlyPageNumbers) {
      chunks.push(chunk);
    }

    if (end >= clean.length) break;

    let nextStart = end - overlap;
    const nextSpace = clean.indexOf(" ", nextStart);
    if (nextSpace !== -1 && nextSpace < end) {
      nextStart = nextSpace + 1;
    }

    start = nextStart > start ? nextStart : end;
  }

  return chunks;
}