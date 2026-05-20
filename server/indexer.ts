// Indexer: per-vault SQLite database with FTS5 for Note + Block search.
// Owns the schema, the read/write side, and the rebuild path that walks the
// Vault from scratch. Synchronous SQLite (bun:sqlite) — mutation methods are
// async only because they read source content from disk through fs/promises.

import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { extractTitle, extractWikilinks } from "./wikilink";
import { listNotes, loadNote } from "./vault";
import { parseDailyNoteBlocks } from "./blockParse";
import type { BacklinkSource, SearchResult } from "@shared/types";

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

export interface IndexStats {
  notes: number;
  daily: number;
  blocks: number;
  wikilinks: number;
  sizeBytes: number;
}

export interface Indexer {
  indexNote(noteId: string): Promise<void>;
  indexDailyNote(date: string): Promise<void>;
  deleteNote(noteId: string): void;
  rebuild(): Promise<{ notes: number; daily: number }>;
  search(query: string, limit?: number): SearchResult[];
  getBacklinks(targetNoteId: string): BacklinkSource[];
  stats(): Promise<IndexStats>;
  close(): void;
}

// Bumped to 2 to add the source_kind/block_index columns to the links table.
// The migration block below drops the old table on upgrade — backlinks are
// fully derived from on-disk Vault content, so dropping costs nothing beyond
// one re-index on the next save.
const SCHEMA_VERSION = 2;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);

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
    source_kind TEXT NOT NULL,
    source_id TEXT NOT NULL,
    block_index INTEGER NOT NULL DEFAULT -1,
    target_title TEXT NOT NULL,
    PRIMARY KEY (source_kind, source_id, block_index, target_title)
  );

  CREATE INDEX IF NOT EXISTS links_by_target ON links (target_title);
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
  // Wait up to 5s if another connection holds the write lock. Belt-and-
  // braces for hot-reload scenarios where a transient second connection
  // momentarily contends with this one before being shut down.
  db.exec("PRAGMA busy_timeout = 5000");

  // Schema migration: drop the v1 links table (different column shape)
  // before the SCHEMA exec re-creates it. Safe because backlinks are
  // re-derived on the next indexNote/indexDailyNote/rebuild call.
  db.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)");
  const currentVersion =
    db
      .query<{ version: number }, []>("SELECT version FROM schema_version LIMIT 1")
      .get()?.version ?? 0;
  if (currentVersion < SCHEMA_VERSION) {
    db.exec("DROP TABLE IF EXISTS links");
    db.exec("DELETE FROM schema_version");
    db.run("INSERT INTO schema_version (version) VALUES (?)", [SCHEMA_VERSION]);
  }

  db.exec(SCHEMA);

  const reindexNote = db.transaction(
    (
      noteId: string,
      title: string | null,
      modified: string,
      bodyHash: string,
      body: string,
      wikilinks: string[],
    ) => {
      db.run("DELETE FROM notes WHERE id = ?", [noteId]);
      db.run("DELETE FROM search_notes WHERE note_id = ?", [noteId]);
      db.run("DELETE FROM links WHERE source_kind = 'note' AND source_id = ?", [noteId]);
      db.run(
        "INSERT INTO notes (id, title, modified, body_hash) VALUES (?, ?, ?, ?)",
        [noteId, title, modified, bodyHash],
      );
      db.run(
        "INSERT INTO search_notes (note_id, title, body) VALUES (?, ?, ?)",
        [noteId, title ?? "", body],
      );
      // De-dupe: one row per (source, target_title). Multiple [[X]] inside
      // the same Note still produce a single backlink entry.
      const seen = new Set<string>();
      for (const target of wikilinks) {
        if (seen.has(target)) continue;
        seen.add(target);
        db.run(
          "INSERT OR IGNORE INTO links (source_kind, source_id, target_title) VALUES ('note', ?, ?)",
          [noteId, target],
        );
      }
    },
  );

  const indexNote = async (noteId: string) => {
    const note = await loadNote(opts.vaultPath, noteId);
    const title = extractTitle(note.body);
    const bodyHash = sha256(note.body);
    const links = extractWikilinks(note.body);
    reindexNote(noteId, title, note.modified, bodyHash, note.body, links);
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
      db.run(
        "DELETE FROM links WHERE source_kind = 'block' AND source_id = ?",
        [date],
      );
      let blockIndex = 0;
      for (const block of blocks) {
        db.run(
          "INSERT INTO search_blocks (daily_date, block_index, time, text) VALUES (?, ?, ?, ?)",
          [date, blockIndex, block.time ?? "", block.text],
        );
        const seen = new Set<string>();
        for (const target of extractWikilinks(block.text)) {
          if (seen.has(target)) continue;
          seen.add(target);
          db.run(
            "INSERT OR IGNORE INTO links (source_kind, source_id, block_index, target_title) VALUES ('block', ?, ?, ?)",
            [date, blockIndex, target],
          );
        }
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

  const getBacklinks = (targetNoteId: string): BacklinkSource[] => {
    const titleRow = db
      .query<{ title: string | null }, [string]>(
        "SELECT title FROM notes WHERE id = ?",
      )
      .get(targetNoteId);
    const title = titleRow?.title;
    if (!title) return [];

    const noteRows = db
      .query<
        { note_id: string; source_title: string | null; body: string },
        [string]
      >(
        `SELECT links.source_id AS note_id,
                notes.title AS source_title,
                search_notes.body AS body
           FROM links
           JOIN notes        ON notes.id        = links.source_id
           JOIN search_notes ON search_notes.note_id = links.source_id
          WHERE links.source_kind = 'note' AND links.target_title = ?
          ORDER BY notes.modified DESC`,
      )
      .all(title);

    const blockRows = db
      .query<
        {
          daily_date: string;
          block_index: number;
          time: string | null;
          text: string;
        },
        [string]
      >(
        `SELECT links.source_id AS daily_date,
                links.block_index AS block_index,
                search_blocks.time AS time,
                search_blocks.text AS text
           FROM links
           JOIN search_blocks
             ON search_blocks.daily_date  = links.source_id
            AND search_blocks.block_index = links.block_index
          WHERE links.source_kind = 'block' AND links.target_title = ?
          ORDER BY links.source_id DESC, links.block_index ASC`,
      )
      .all(title);

    const out: BacklinkSource[] = [];
    for (const r of noteRows) {
      out.push({
        kind: "note",
        noteId: r.note_id,
        title: r.source_title,
        snippet: snippetAroundLink(r.body, title),
      });
    }
    for (const r of blockRows) {
      out.push({
        kind: "block",
        dailyDate: r.daily_date,
        blockIndex: r.block_index,
        time: r.time && r.time.length > 0 ? r.time : null,
        snippet: snippetAroundLink(r.text, title),
      });
    }
    return out;
  };

  const stats = async (): Promise<IndexStats> => {
    const countOne = (sql: string): number =>
      db.query<{ n: number }, []>(sql).get()?.n ?? 0;
    let sizeBytes = 0;
    try {
      const info = await stat(opts.dbPath);
      sizeBytes = info.size;
    } catch {
      // Database file may not exist yet (e.g., right after a rebuild that
      // hasn't been flushed). Reporting 0 is harmless for the diagnostics UI.
    }
    return {
      notes: countOne("SELECT COUNT(*) AS n FROM notes"),
      daily: countOne(
        "SELECT COUNT(DISTINCT daily_date) AS n FROM search_blocks",
      ),
      blocks: countOne("SELECT COUNT(*) AS n FROM search_blocks"),
      wikilinks: countOne("SELECT COUNT(*) AS n FROM links"),
      sizeBytes,
    };
  };

  return {
    indexNote,
    indexDailyNote,
    deleteNote,
    rebuild,
    search,
    getBacklinks,
    stats,
    close: () => db.close(),
  };
}

// Walk back from the first occurrence of [[targetTitle]] in `body` and grab
// roughly `window` characters of surrounding text, trimmed to word
// boundaries so the snippet reads cleanly. Falls back to the head of the
// body when the link isn't found (shouldn't happen, but defensive).
function snippetAroundLink(body: string, targetTitle: string, window = 80): string {
  const needle = `[[${targetTitle}`;
  const at = body.indexOf(needle);
  if (at < 0) return body.slice(0, window * 2).trim();
  const start = Math.max(0, at - window);
  const end = Math.min(body.length, at + needle.length + window);
  let slice = body.slice(start, end);
  if (start > 0) slice = "…" + slice.replace(/^\S*\s/, "");
  if (end < body.length) slice = slice.replace(/\s\S*$/, "") + "…";
  return slice.replace(/\s+/g, " ").trim();
}

function ensureParentDirSync(filePath: string) {
  mkdirSync(path.dirname(filePath), { recursive: true });
}
