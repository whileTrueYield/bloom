// Count human-meaningful words in a markdown body for the status bar's
// "N words" indicator. Strips markdown syntax that would otherwise inflate
// the count: heading markers (#), horizontal rules (---), wikilink brackets
// (the inner text is kept; the piped target is dropped in favor of the
// display label).

export function wordCount(body: string): number {
  if (!body) return 0;

  const cleaned = body
    // Wikilink display: [[Target|label]] → " label "
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, " $2 ")
    // Plain wikilink: [[Target]] → " Target "
    .replace(/\[\[([^\]]+)\]\]/g, " $1 ")
    // Horizontal rule, line-anchored, optionally with whitespace
    .replace(/^\s*---+\s*$/gm, " ")
    // Leading heading hashes on a line: "## title" → "title"
    .replace(/^\s*#+\s+/gm, "");

  const matches = cleaned.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return matches ? matches.length : 0;
}
