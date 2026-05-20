// URL-hash routing for the Workspace. Surfaces that share the hash today:
// individual Notes, Daily Notes (with an optional Block index for deep-links),
// and the Settings page.
//
// Wire format:
//   ''                          → no Note open (welcome view)
//   #note/<urlencoded-id>       → open Note <id>
//   #daily/YYYY-MM-DD           → open the Daily Note for that date
//   #daily/YYYY-MM-DD/b/<n>     → open it and scroll to Block <n> (0-based)
//   #settings                   → open the Settings page
//
// Anything else parses as `none` rather than throwing — typos in the URL bar
// shouldn't crash the app, they should just land on the welcome view.

export type Route =
  | { kind: "none" }
  | { kind: "note"; noteId: string }
  | { kind: "daily"; date: string; blockIndex: number | null }
  | { kind: "settings" };

const NOTE_RE = /^#note\/(.+)$/;
const DAILY_RE = /^#daily\/(\d{4}-\d{2}-\d{2})(?:\/b\/(\d+))?$/;

export function parseRoute(hash: string): Route {
  if (!hash || hash === "#") return { kind: "none" };
  if (hash === "#settings") return { kind: "settings" };

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
    case "settings":
      return "#settings";
  }
}
