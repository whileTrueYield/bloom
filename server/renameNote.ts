// Note rename pipeline (#14). Detects an H1 change between the on-disk Note
// and the incoming body. If the title is unchanged, hands off to a normal
// save. If the title changed:
//
//   1. Build a rename plan (every Note + Daily Note containing `[[oldTitle]]`).
//   2. If the plan would touch more than `confirmThreshold` references and the
//      caller didn't explicitly confirm, return { kind: 'needsConfirm', plan }
//      without writing anything — the UI shows a modal.
//   3. Snapshot every source file's bytes, then write the rewritten content
//      sequentially. On any write failure, restore every successfully-written
//      file from its snapshot and re-throw — the rename is fully undone.
//   4. Save the renamed Note last (so a failure before this point leaves the
//      Note unchanged on disk too).
//   5. Reindex every touched file. Reindex calls happen sequentially after
//      file writes; if one fails, files are already consistent on disk and
//      the watcher will reconcile any partial index state.

import { rename, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { Indexer } from "./indexer";
import { extractTitle } from "./wikilink";
import { findNoteReferences, type RenamePlan } from "./findNoteReferences";

// Public threshold — duplicated in the AC for the confirmation modal. Kept
// here as a named constant so tests don't have to encode the magic number.
export const RENAME_CONFIRM_THRESHOLD = 5;

export interface RenameOptions {
  vaultPath: string;
  indexer: Indexer;
  noteId: string;
  newBody: string;
  renameConfirmed?: boolean;
  // Called for every file path the rename is about to touch — the route
  // wires this to the Vault watcher's self-write marker so external-change
  // SSE events don't fire for our own rewrites.
  markSelfWrite?: (filePath: string) => void;
  // Test seam: injected to simulate fs failures mid-rewrite without monkey-
  // patching node:fs/promises across the suite.
  writeFileOverride?: (filePath: string, contents: string) => Promise<void>;
}

export type RenameResult =
  | { kind: "saved" }
  | { kind: "renamed"; oldTitle: string; newTitle: string; refsRewritten: number }
  | { kind: "needsConfirm"; plan: RenamePlan };

export async function renameNote(opts: RenameOptions): Promise<RenameResult> {
  const {
    vaultPath,
    indexer,
    noteId,
    newBody,
    renameConfirmed = false,
    markSelfWrite,
    writeFileOverride,
  } = opts;
  const writeFn = writeFileOverride ?? writeFile;
  const markWritten = markSelfWrite ?? (() => {});

  const notePath = path.join(vaultPath, "notes", `${noteId}.md`);
  const noteRaw = await readFile(notePath, "utf8");
  const noteParsed = matter(noteRaw);
  const oldTitle = extractTitle(noteParsed.content);
  const newTitle = extractTitle(newBody);

  const titleChanged =
    oldTitle != null &&
    newTitle != null &&
    oldTitle.trim() !== "" &&
    newTitle.trim() !== "" &&
    oldTitle !== newTitle;

  // No title rewrite: just save the note and reindex.
  if (!titleChanged) {
    await writeNoteBody(notePath, noteParsed.data, newBody, writeFn);
    markWritten(notePath);
    await indexer.indexNote(noteId);
    return { kind: "saved" };
  }

  const plan = await findNoteReferences(vaultPath, oldTitle!, newTitle!);

  if (
    plan.totalReferences > RENAME_CONFIRM_THRESHOLD &&
    !renameConfirmed
  ) {
    return { kind: "needsConfirm", plan };
  }

  // Snapshot every source file and the Note itself before any write, so we
  // can restore on failure.
  const snapshots = new Map<string, string>();
  snapshots.set(notePath, noteRaw);
  for (const source of plan.sources) {
    snapshots.set(source.path, await readFile(source.path, "utf8"));
  }

  const writtenPaths: string[] = [];
  try {
    // Sources first — if any fails, the Note hasn't changed yet, so partial
    // rollback is just restoring the successful source writes. We mark each
    // self-write AFTER its write completes so the watcher captures the bytes
    // we actually committed (the cache is then primed against any FSEvents
    // echo for the same content).
    for (const source of plan.sources) {
      await writeFn(source.path, source.newBody);
      markWritten(source.path);
      writtenPaths.push(source.path);
    }
    // Then the Note itself.
    await writeNoteBody(notePath, noteParsed.data, newBody, writeFn);
    markWritten(notePath);
    writtenPaths.push(notePath);
  } catch (err) {
    // Restore in reverse-write order. We use the real fs writeFile here on
    // purpose — the override is the failure surface, not the rollback path.
    for (const written of writtenPaths.reverse()) {
      try {
        await writeFile(written, snapshots.get(written)!);
      } catch {
        // Best-effort: if rollback itself fails the watcher's reindex will
        // catch the divergence on the next vault scan.
      }
    }
    throw err;
  }

  // All writes succeeded — reindex everything touched. Sequential is fine
  // here; the index is single-writer and any one failure will be picked up
  // by the next watcher event for that file.
  await indexer.indexNote(noteId);
  for (const source of plan.sources) {
    if (source.kind === "note") {
      await indexer.indexNote(source.noteId);
    } else {
      await indexer.indexDailyNote(source.dailyDate);
    }
  }

  return {
    kind: "renamed",
    oldTitle: oldTitle!,
    newTitle: newTitle!,
    refsRewritten: plan.totalReferences,
  };
}

// Same tmp-and-rename dance saveNote uses in vault.ts, but driven by an
// injectable writer so tests can simulate mid-write failures.
async function writeNoteBody(
  notePath: string,
  frontmatter: object,
  body: string,
  writeFn: (filePath: string, contents: string) => Promise<void>,
): Promise<void> {
  const tmpPath = `${notePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFn(tmpPath, matter.stringify(body, frontmatter));
  await rename(tmpPath, notePath);
}
