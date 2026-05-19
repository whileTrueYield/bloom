// Wikilink module: parsers for Note titles and inline [[wikilinks]], plus
// a resolver that maps a link text to the id of its target Note (or null).
// The parser stays pure; the resolver scans the Vault on each call — fine
// for v0 (small vaults), the Indexer in slice #9 replaces this with a
// sub-millisecond FTS lookup.

import { listNotes, loadNote } from "./vault";

export function extractTitle(body: string): string | null {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? match[1]!.trim() : null;
}

// Matches [[target]] and [[target|display]]. We capture the target only —
// the display text is a UI concern that doesn't affect link resolution.
const WIKILINK_RE = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;

export function extractWikilinks(body: string): string[] {
  const links: string[] = [];
  for (const match of body.matchAll(WIKILINK_RE)) {
    links.push(match[1]!.trim());
  }
  return links;
}

export async function resolveWikilink(
  vaultPath: string,
  linkText: string,
): Promise<string | null> {
  const summaries = await listNotes(vaultPath);
  for (const summary of summaries) {
    const note = await loadNote(vaultPath, summary.id);
    if (extractTitle(note.body) === linkText) return summary.id;
  }
  return null;
}

import type { WikilinkSuggestion } from "@shared/types";
export type { WikilinkSuggestion };

// Case-insensitive — the suggester is a discovery aid, not a strict matcher.
// The selected title is inserted verbatim, so the resulting [[Title]] still
// resolves cleanly through the case-sensitive resolver.
export async function suggestWikilinks(
  vaultPath: string,
  query: string,
  limit = 8,
): Promise<WikilinkSuggestion[]> {
  const summaries = await listNotes(vaultPath);
  const q = query.toLowerCase();

  const tier1: WikilinkSuggestion[] = [];
  const tier2: WikilinkSuggestion[] = [];
  for (const summary of summaries) {
    const note = await loadNote(vaultPath, summary.id);
    const title = extractTitle(note.body);
    if (!title) continue;
    const t = title.toLowerCase();
    const base = { id: summary.id, title, modified: summary.modified };
    if (t.startsWith(q)) {
      tier1.push({ ...base, tier: 1 });
    } else if (t.includes(q)) {
      tier2.push({ ...base, tier: 2 });
    }
  }
  return [...tier1, ...tier2].slice(0, limit);
}
