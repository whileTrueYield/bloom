// Map a Block index (0-based, as carried in `#daily/<date>/b/<n>` URLs and
// emitted by the search indexer) to the 0-based line number of that Block's
// heading inside a Daily Note body. Used by the editor to scroll to a
// deep-linked Block. Returns null if the index doesn't resolve.
//
// Block headings start with `## HH:MM` and optionally carry geo coords. A
// user-typed `## Reference` inside Block text is NOT a Block boundary — only
// the time-leading headings count, matching the server-side blockParse.

const HEADING_RE = /^##\s+\d{2}:\d{2}(?:\s|\(|$)/;

export function findBlockLine(body: string, blockIndex: number): number | null {
  if (blockIndex < 0) return null;
  const lines = body.split("\n");
  let seen = 0;
  for (let i = 0; i < lines.length; i++) {
    if (HEADING_RE.test(lines[i]!)) {
      if (seen === blockIndex) return i;
      seen += 1;
    }
  }
  return null;
}
