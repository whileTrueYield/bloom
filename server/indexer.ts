// Indexer: per-vault SQLite database with FTS5 for Note + Block search.
// Owns the schema, the read/write side, and the rebuild path that walks the
// Vault from scratch. Synchronous SQLite (bun:sqlite) — mutation methods are
// async only because they read source content from disk through fs/promises.

import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { extractTitle, extractWikilinks } from "./wikilink";
import { listNotes, loadNote } from "./vault";
import { parseDailyNoteBlocks } from "./blockParse";
import type { SearchResult } from "@shared/types";

// FTS5 treats some punctuation as syntax. Strip the problematic characters so
// queries from a humans-typing-stuff source can't blow up the parser.
function sanitizeFtsQuery(raw: string): string {
  return raw.replace(/["'()*]/g, "").replace(/\s+/g, " ").trim();
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export interface IndexerOptions {
  dbPath: string;
  vaultPath: string;
}

export interface Indexer {
  indexNote(noteId: string): Promise<void>;
  indexDailyNote(date: string): Promise<void>;
  deleteNote(noteId: string): void;
  rebuild(): Promise<{ notes: number; daily: number }>;
  search(query: string, limit?: number): SearchResult[];
  close(): void;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
  INSERT OR IGNORE INTO schema_version (version) VALUES (1);

  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT,
    modified TEXT NOT NULL,
    body_hash TEXT NOT NULL
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS search_notes USING fts5(
    note_id UNINDEXED,
    title,
    body,
    tokenize='trigram'
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS search_blocks USING fts5(
    daily_date UNINDEXED,
    block_index UNINDEXED,
    time UNINDEXED,
    text,
    tokenize='trigram'
  );

  CREATE TABLE IF NOT EXISTS links (
    source_id TEXT NOT NULL,
    target_title TEXT NOT NULL,
    PRIMARY KEY (source_id, target_title)
  );
`;

export function createIndexer(opts: IndexerOptions): Indexer {
  // Ensure the parent directory exists before opening the DB.
  // mkdir is sync-safe here because the parent is constructed eagerly.
  // We use sync mkdir via the runtime — node:fs would block, so we cheat
  // and use Bun's filesystem which handles the sync path internally.
  // For simplicity we just call mkdir before the first write instead.
  ensureParentDirSync(opts.dbPath);

  const db = new Database(opts.dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(SCHEMA);

  const reindexNote = db.transaction(
    (noteId: string, title: string | null, modified: string, bodyHash: string, body: string) => {
      db.run("DELETE FROM notes WHERE id = ?", [noteId]);
      db.run("DELETE FROM search_notes WHERE note_id = ?", [noteId]);
      db.run(
        "INSERT INTO notes (id, title, modified, body_hash) VALUES (?, ?, ?, ?)",
        [noteId, title, modified, bodyHash],
      );
      db.run(
        "INSERT INTO search_notes (note_id, title, body) VALUES (?, ?, ?)",
        [noteId, title ?? "", body],
      );
    },
  );

  const indexNote = async (noteId: string) => {
    const note = await loadNote(opts.vaultPath, noteId);
    const title = extractTitle(note.body);
    const bodyHash = sha256(note.body);
    reindexNote(noteId, title, note.modified, bodyHash, note.body);
  };

  const indexDailyNote = async (date: string) => {
    const dailyPath = path.join(opts.vaultPath, "daily", `${date}.md`);
    let body = "";
    try {
      const raw = await readFile(dailyPath, "utf8");
      body = matter(raw).content;
    } catch {
      // File doesn't exist — clear any stale block rows for the date below.
    }
    const blocks = parseDailyNoteBlocks(body);

    db.transaction(() => {
      db.run("DELETE FROM search_blocks WHERE daily_date = ?", [date]);
      let blockIndex = 0;
      for (const block of blocks) {
        db.run(
          "INSERT INTO search_blocks (daily_date, block_index, time, text) VALUES (?, ?, ?, ?)",
          [date, blockIndex, block.time ?? "", block.text],
        );
        blockIndex += 1;
      }
    })();
  };

  const deleteNote = (noteId: string) => {
    db.run("DELETE FROM notes WHERE id = ?", [noteId]);
    db.run("DELETE FROM search_notes WHERE note_id = ?", [noteId]);
  };

  const listDailyDates = async (): Promise<string[]> => {
    const dailyDir = path.join(opts.vaultPath, "daily");
    let names: string[];
    try {
      names = await readdir(dailyDir);
    } catch {
      return [];
    }
    return names.filter((n) => n.endsWith(".md")).map((n) => n.slice(0, -3));
  };

  const rebuild = async () => {
    db.exec(
      "DELETE FROM notes; DELETE FROM search_notes; DELETE FROM search_blocks; DELETE FROM links;",
    );
    const noteSummaries = await listNotes(opts.vaultPath);
    for (const summary of noteSummaries) await indexNote(summary.id);
    const dailyDates = await listDailyDates();
    for (const date of dailyDates) await indexDailyNote(date);
    return { notes: noteSummaries.length, daily: dailyDates.length };
  };

  const search = (query: string, limit = 20): SearchResult[] => {
      const q = sanitizeFtsQuery(query);
      if (!q) return [];

      const noteRows = db
        .prepare<
          { note_id: string; title: string | null; snippet: string; rank: number },
          [string, number]
        >(
          `SELECT n.note_id AS note_id,
                  notes.title AS title,
                  snippet(search_notes, 2, '', '', '…', 32) AS snippet,
                  n.rank AS rank
             FROM search_notes n
             JOIN notes ON notes.id = n.note_id
            WHERE search_notes MATCH ?
            ORDER BY rank
            LIMIT ?`,
        )
        .all(q, limit);

      const blockRows = db
        .prepare<
          {
            daily_date: string;
            block_index: number;
            time: string;
            snippet: string;
            rank: number;
          },
          [string, number]
        >(
          `SELECT daily_date,
                  block_index,
                  time,
                  snippet(search_blocks, 3, '', '', '…', 32) AS snippet,
                  rank
             FROM search_blocks
            WHERE search_blocks MATCH ?
            ORDER BY rank
            LIMIT ?`,
        )
        .all(q, limit);

      const hits: SearchResult[] = [
        ...noteRows.map<SearchResult>((r) => ({
          kind: "note",
          noteId: r.note_id,
          title: r.title,
          snippet: r.snippet,
          rank: r.rank,
        })),
        ...blockRows.map<SearchResult>((r) => ({
          kind: "block",
          dailyDate: r.daily_date,
          blockIndex: r.block_index,
          time: r.time || null,
          snippet: r.snippet,
          rank: r.rank,
        })),
      ];

    hits.sort((a, b) => a.rank - b.rank);
    return hits.slice(0, limit);
  };

  return {
    indexNote,
    indexDailyNote,
    deleteNote,
    rebuild,
    search,
    close: () => db.close(),
  };
}

function ensureParentDirSync(filePath: string) {
  mkdirSync(path.dirname(filePath), { recursive: true });
}
