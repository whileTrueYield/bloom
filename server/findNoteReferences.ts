// Reference-finder for the rename pipeline (#14). Walks every Note and Daily
// Note in the Vault and returns an execute-ready plan: per source file, the
// post-rewrite body and how many references it contains. The orchestrator
// later snapshots+writes these in sequence with rollback on failure.
//
// The plan rewrites occurrences of the *exact* old title only. References
// authored via an alias (link text != title) are not in the plan, satisfying
// the AC that aliases must not be auto-rewritten.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { listNotes } from "./vault";
import { rewriteWikilinkTarget } from "./rewriteWikilink";

export type RenameSource =
  | {
      kind: "note";
      noteId: string;
      path: string;
      count: number;
      newBody: string;
    }
  | {
      kind: "daily";
      dailyDate: string;
      path: string;
      count: number;
      newBody: string;
    };

export interface RenamePlan {
  oldTitle: string;
  newTitle: string;
  sources: RenameSource[];
  totalReferences: number;
}

const DAILY_FILENAME_RE = /^(\d{4}-\d{2}-\d{2})\.md$/;

export async function findNoteReferences(
  vaultPath: string,
  oldTitle: string,
  newTitle: string,
): Promise<RenamePlan> {
  const sources: RenameSource[] = [];

  // Notes.
  const noteSummaries = await listNotes(vaultPath);
  for (const summary of noteSummaries) {
    const notePath = path.join(vaultPath, "notes", `${summary.id}.md`);
    const raw = await readFile(notePath, "utf8");
    const parsed = matter(raw);
    const result = rewriteWikilinkTarget(parsed.content, oldTitle, newTitle);
    if (result.count === 0) continue;
    // Re-serialize through gray-matter so frontmatter formatting stays stable.
    const rewrittenFile = matter.stringify(result.body, parsed.data);
    sources.push({
      kind: "note",
      noteId: summary.id,
      path: notePath,
      count: result.count,
      newBody: rewrittenFile,
    });
  }

  // Daily Notes.
  const dailyDir = path.join(vaultPath, "daily");
  let dailyNames: string[];
  try {
    dailyNames = await readdir(dailyDir);
  } catch {
    dailyNames = [];
  }
  for (const name of dailyNames) {
    const m = name.match(DAILY_FILENAME_RE);
    if (!m) continue;
    const dailyPath = path.join(dailyDir, name);
    const raw = await readFile(dailyPath, "utf8");
    const parsed = matter(raw);
    const result = rewriteWikilinkTarget(parsed.content, oldTitle, newTitle);
    if (result.count === 0) continue;
    const rewrittenFile = matter.stringify(result.body, parsed.data);
    sources.push({
      kind: "daily",
      dailyDate: m[1]!,
      path: dailyPath,
      count: result.count,
      newBody: rewrittenFile,
    });
  }

  const totalReferences = sources.reduce((n, s) => n + s.count, 0);
  return { oldTitle, newTitle, sources, totalReferences };
}
