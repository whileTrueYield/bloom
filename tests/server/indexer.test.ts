// Indexer module tests. Each test gets a freshly bootstrapped vault and a
// temp DB path so behavior is observable through real SQLite round-trips.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  bootstrapVaultLayout,
  createNote,
  saveNote,
} from "@server/vault";
import { appendBlock } from "@server/dailyNote";
import { createIndexer, type Indexer } from "@server/indexer";

let workdir: string;
let vaultPath: string;
let dbPath: string;
let indexer: Indexer;

beforeEach(async () => {
  workdir = await mkdtemp(path.join(tmpdir(), "bloom-indexer-"));
  vaultPath = path.join(workdir, "vault");
  dbPath = path.join(workdir, "index", "index.sqlite");
  await mkdir(vaultPath);
  await bootstrapVaultLayout(vaultPath);
  indexer = createIndexer({ dbPath, vaultPath });
});

afterEach(async () => {
  indexer.close();
  await rm(workdir, { recursive: true, force: true });
});

describe("createIndexer", () => {
  it("creates the database file and a usable empty schema on first open", () => {
    expect(existsSync(dbPath)).toBe(true);
    expect(indexer.search("anything")).toEqual([]);
  });
});

describe("indexNote", () => {
  it("makes the Note searchable by title and body content", async () => {
    const note = await createNote(vaultPath);
    await saveNote(
      vaultPath,
      note.id,
      "# Zettelkasten as thinking tool\n\nAtomic notes work because the linking happens at write time.",
    );

    await indexer.indexNote(note.id);

    const titleHit = indexer.search("Zettelkasten");
    expect(titleHit).toHaveLength(1);
    expect(titleHit[0]).toMatchObject({
      kind: "note",
      noteId: note.id,
      title: "Zettelkasten as thinking tool",
    });

    const bodyHit = indexer.search("atomic notes");
    expect(bodyHit).toHaveLength(1);
    const hit = bodyHit[0]!;
    expect(hit.kind).toBe("note");
    if (hit.kind === "note") expect(hit.noteId).toBe(note.id);
  });

  it("is idempotent: re-indexing the same Note replaces rather than duplicates", async () => {
    const note = await createNote(vaultPath);
    await saveNote(vaultPath, note.id, "# First Title\n\nOriginal body.");
    await indexer.indexNote(note.id);
    await indexer.indexNote(note.id);

    expect(indexer.search("First Title")).toHaveLength(1);

    await saveNote(vaultPath, note.id, "# Second Title\n\nRewritten body.");
    await indexer.indexNote(note.id);

    expect(indexer.search("First Title")).toHaveLength(0);
    expect(indexer.search("Second Title")).toHaveLength(1);
    expect(indexer.search("Rewritten")).toHaveLength(1);
  });
});

describe("indexDailyNote", () => {
  it("indexes each Block individually so each is independently searchable", async () => {
    const day = new Date("2026-05-19T09:14:00");
    await appendBlock(vaultPath, { text: "alpha thought", now: day });
    await appendBlock(vaultPath, {
      text: "bravo thought",
      now: new Date("2026-05-19T10:32:00"),
    });

    await indexer.indexDailyNote("2026-05-19");

    const alpha = indexer.search("alpha");
    expect(alpha).toHaveLength(1);
    expect(alpha[0]).toMatchObject({
      kind: "block",
      dailyDate: "2026-05-19",
      blockIndex: 0,
      time: "09:14",
    });

    const bravo = indexer.search("bravo");
    expect(bravo[0]).toMatchObject({
      kind: "block",
      dailyDate: "2026-05-19",
      blockIndex: 1,
      time: "10:32",
    });
  });

  it("replaces a day's Blocks when re-indexed (idempotent + post-edit)", async () => {
    const day = new Date("2026-05-19T09:14:00");
    await appendBlock(vaultPath, { text: "ephemeral thought", now: day });

    await indexer.indexDailyNote("2026-05-19");
    expect(indexer.search("ephemeral")).toHaveLength(1);

    // Same indexDailyNote call should not duplicate.
    await indexer.indexDailyNote("2026-05-19");
    expect(indexer.search("ephemeral")).toHaveLength(1);
  });
});

describe("rebuild", () => {
  it("re-indexes every Note and Daily Note found in the Vault", async () => {
    const note = await createNote(vaultPath);
    await saveNote(vaultPath, note.id, "# Whitepaper\n\nbody about something");

    await appendBlock(vaultPath, {
      text: "captured fragment about widgets",
      now: new Date("2026-05-19T09:14:00"),
    });

    // Open a fresh DB and let rebuild() populate it.
    indexer.close();
    indexer = createIndexer({ dbPath, vaultPath });
    expect(indexer.search("Whitepaper")).toHaveLength(0);

    const counts = await indexer.rebuild();
    expect(counts.notes).toBe(1);
    expect(counts.daily).toBe(1);

    expect(indexer.search("Whitepaper")).toHaveLength(1);
    expect(indexer.search("widgets")).toHaveLength(1);
  });
});

describe("deleteNote", () => {
  it("removes the Note from search", async () => {
    const note = await createNote(vaultPath);
    await saveNote(vaultPath, note.id, "# Deletable\n\nbody");
    await indexer.indexNote(note.id);
    expect(indexer.search("Deletable")).toHaveLength(1);

    indexer.deleteNote(note.id);
    expect(indexer.search("Deletable")).toHaveLength(0);
  });
});
