// Pure rewriter that retargets every `[[Old Title]]` and `[[Old Title|display]]`
// reference in a body to `[[New Title]]` / `[[New Title|display]]`. The
// display label (the text after `|`) is preserved verbatim because the user
// authored it on purpose.
//
// Matches are case-sensitive and require an exact target match after trimming
// the brackets' interior whitespace — `[[Old]]` does not match `[[Old Title]]`,
// and aliases (whose text differs from the title) are skipped naturally.

export interface RewriteResult {
  body: string;
  count: number;
}

const WIKILINK_RE = /\[\[\s*([^\]|]+?)\s*(\|[^\]]*)?\]\]/g;

export function rewriteWikilinkTarget(
  body: string,
  oldTitle: string,
  newTitle: string,
): RewriteResult {
  let count = 0;
  const rewritten = body.replace(WIKILINK_RE, (match, target: string, pipeAndDisplay?: string) => {
    if (target !== oldTitle) return match;
    count += 1;
    return pipeAndDisplay ? `[[${newTitle}${pipeAndDisplay}]]` : `[[${newTitle}]]`;
  });
  return { body: rewritten, count };
}
