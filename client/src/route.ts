// URL-hash routing for the Workspace. Two surfaces share the hash today —
// individual Notes and Daily Notes — and Daily Notes additionally carry an
// optional Block index so the command palette (and any bookmark someone
// pastes around) can deep-link to a specific captured Block.
//
// Wire format:
//   ''                          → no Note open (welcome view)
//   #note/<urlencoded-id>       → open Note <id>
//   #daily/YYYY-MM-DD           → open the Daily Note for that date
//   #daily/YYYY-MM-DD/b/<n>     → open it and scroll to Block <n> (0-based)
//
// Anything else parses as `none` rather than throwing — typos in the URL bar
// shouldn't crash the app, they should just land on the welcome view.

export type Route =
  | { kind: "none" }
  | { kind: "note"; noteId: string }
  | { kind: "daily"; date: string; blockIndex: number | null };

const NOTE_RE = /^#note\/(.+)$/;
const DAILY_RE = /^#daily\/(\d{4}-\d{2}-\d{2})(?:\/b\/(\d+))?$/;

export function parseRoute(hash: string): Route {
  if (!hash || hash === "#") return { kind: "none" };

  const note = hash.match(NOTE_RE);
  if (note) return { kind: "note", noteId: decodeURIComponent(note[1]!) };

  const daily = hash.match(DAILY_RE);
  if (daily) {
    return {
      kind: "daily",
      date: daily[1]!,
      blockIndex: daily[2] != null ? Number(daily[2]) : null,
    };
  }

  return { kind: "none" };
}

export function formatRoute(route: Route): string {
  switch (route.kind) {
    case "none":
      return "";
    case "note":
      return `#note/${encodeURIComponent(route.noteId)}`;
    case "daily":
      return route.blockIndex == null
        ? `#daily/${route.date}`
        : `#daily/${route.date}/b/${route.blockIndex}`;
  }
}
