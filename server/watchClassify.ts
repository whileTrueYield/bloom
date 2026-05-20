// classifyVaultPath: maps an absolute filesystem path to "what does the
// Indexer need to do about it." The watcher uses this to route events to the
// right Indexer method (or drop them entirely).
//
// Only `notes/<id>.md` and `daily/<YYYY-MM-DD>.md` are interesting. Anything
// else — attachments, hidden files, atomic-save tmp files, paths outside the
// vault — is classified `ignored`.

import path from "node:path";

export type ClassifiedPath =
  | { kind: "note"; noteId: string }
  | { kind: "daily"; dailyDate: string }
  | { kind: "ignored" };

export function classifyVaultPath(vaultPath: string, absPath: string): ClassifiedPath {
  const rel = path.relative(vaultPath, absPath);
  // path.relative produces ".." prefixes when absPath is outside the root.
  if (rel.startsWith("..") || path.isAbsolute(rel)) return { kind: "ignored" };

  const segments = rel.split(path.sep);
  if (segments.length !== 2) return { kind: "ignored" };

  const [sub, filename] = segments as [string, string];
  if (!filename.endsWith(".md")) return { kind: "ignored" };
  if (filename.startsWith(".")) return { kind: "ignored" };

  const stem = filename.slice(0, -3);
  if (sub === "notes") return { kind: "note", noteId: stem };
  if (sub === "daily") return { kind: "daily", dailyDate: stem };
  return { kind: "ignored" };
}
