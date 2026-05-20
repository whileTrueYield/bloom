// Indexer backlinks: every Note save reparses Wikilinks and updates the
// link graph; getBacklinks(noteId) returns every Note and Daily Note Block
// whose body links to that Note (by title).

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { bootstrapVaultLayout, createNote, saveNote } from "@server/vault";
import { appendBlock } from "@server/dailyNote";
import { createIndexer, type Indexer } from "@server/indexer";

let workdir: string;
let vaultPath: string;
let dbPath: string;
let indexer: Indexer;

beforeEach(async () => {
  workdir = await mkdtemp(path.join(tmpdir(), "bloom-backlinks-"));
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

describe("getBacklinks — Note sources", () => {
  it("returns a Note that contains a wikilink pointing at the target's title", async () => {
    const target = await createNote(vaultPath);
    await saveNote(vaultPath, target.id, "# Alpha\n\nThe target.");
    const source = await createNote(vaultPath);
    await saveNote(
      vaultPath,
      source.id,
      "# Source\n\nThis paragraph references [[Alpha]] inline.",
    );

    await indexer.indexNote(target.id);
    await indexer.indexNote(source.id);

    const backlinks = indexer.getBacklinks(target.id);
    expect(backlinks).toHaveLength(1);
    const hit = backlinks[0]!;
    expect(hit.kind).toBe("note");
    if (hit.kind === "note") {
      expect(hit.noteId).toBe(source.id);
      expect(hit.title).toBe("Source");
    }
  });

  it("prunes a Note backlink when the source removes the wikilink on re-save", async () => {
    const target = await createNote(vaultPath);
    await saveNote(vaultPath, target.id, "# Alpha\n\nbody");
    const source = await createNote(vaultPath);
    await saveNote(vaultPath, source.id, "# Source\n\n[[Alpha]] reference");

    await indexer.indexNote(target.id);
    await indexer.indexNote(source.id);
    expect(indexer.getBacklinks(target.id)).toHaveLength(1);

    await saveNote(vaultPath, source.id, "# Source\n\nno more link");
    await indexer.indexNote(source.id);

    expect(indexer.getBacklinks(target.id)).toEqual([]);
  });

  it("scopes block_index correctly so each Block links independently", async () => {
    const target = await createNote(vaultPath);
    await saveNote(vaultPath, target.id, "# Alpha\n");
    await appendBlock(vaultPath, {
      text: "I was thinking about [[Alpha]] earlier.",
      now: new Date("2026-05-19T09:14:00"),
    });
    await appendBlock(vaultPath, {
      text: "Different topic, no link here.",
      now: new Date("2026-05-19T10:32:00"),
    });
    await appendBlock(vaultPath, {
      text: "back to [[Alpha]] again",
      now: new Date("2026-05-19T11:00:00"),
    });

    await indexer.indexNote(target.id);
    await indexer.indexDailyNote("2026-05-19");

    const backlinks = indexer.getBacklinks(target.id);
    expect(backlinks).toHaveLength(2);
    const blocks = backlinks.filter((b) => b.kind === "block");
    expect(blocks).toHaveLength(2);
    const indices = blocks
      .map((b) => (b.kind === "block" ? b.blockIndex : -1))
      .sort();
    expect(indices).toEqual([0, 2]);
  });

  it("prunes block backlinks when the Daily Note is re-indexed without them", async () => {
    const target = await createNote(vaultPath);
    await saveNote(vaultPath, target.id, "# Alpha\n");
    await appendBlock(vaultPath, {
      text: "[[Alpha]] mention",
      now: new Date("2026-05-19T09:14:00"),
    });
    await indexer.indexNote(target.id);
    await indexer.indexDailyNote("2026-05-19");
    expect(indexer.getBacklinks(target.id)).toHaveLength(1);

    // Rewrite the daily file without the link, then re-index.
    const dailyPath = path.join(vaultPath, "daily", "2026-05-19.md");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      dailyPath,
      "---\ndate: '2026-05-19'\ncreated: '2026-05-19T09:14:00.000Z'\n---\n## 09:14\nno more mention\n",
    );
    await indexer.indexDailyNote("2026-05-19");

    expect(indexer.getBacklinks(target.id)).toEqual([]);
  });

  it("includes a snippet around the wikilink occurrence", async () => {
    const target = await createNote(vaultPath);
    await saveNote(vaultPath, target.id, "# Alpha\n");
    const source = await createNote(vaultPath);
    await saveNote(
      vaultPath,
      source.id,
      "# Source\n\nThe earlier paragraph leads into the [[Alpha]] reference and continues.",
    );
    await indexer.indexNote(target.id);
    await indexer.indexNote(source.id);

    const [hit] = indexer.getBacklinks(target.id);
    expect(hit!.snippet).toContain("Alpha");
    expect(hit!.snippet).toContain("reference");
  });

  it("returns an empty array when the target Note has no title", async () => {
    const target = await createNote(vaultPath);
    await saveNote(vaultPath, target.id, "no heading here, just body");
    await indexer.indexNote(target.id);

    expect(indexer.getBacklinks(target.id)).toEqual([]);
  });

  it("removes a source's outgoing links when that source Note is deleted", async () => {
    const target = await createNote(vaultPath);
    await saveNote(vaultPath, target.id, "# Alpha\n");
    const source = await createNote(vaultPath);
    await saveNote(vaultPath, source.id, "# Source\n\n[[Alpha]]");
    await indexer.indexNote(target.id);
    await indexer.indexNote(source.id);
    expect(indexer.getBacklinks(target.id)).toHaveLength(1);

    indexer.deleteNote(source.id);

    expect(indexer.getBacklinks(target.id)).toEqual([]);
  });

  it("deduplicates multiple wikilinks from the same Note to the same target", async () => {
    const target = await createNote(vaultPath);
    await saveNote(vaultPath, target.id, "# Alpha\n");
    const source = await createNote(vaultPath);
    await saveNote(
      vaultPath,
      source.id,
      "# Source\n\nfirst [[Alpha]] and a second [[Alpha]] in the same Note.",
    );
    await indexer.indexNote(target.id);
    await indexer.indexNote(source.id);

    expect(indexer.getBacklinks(target.id)).toHaveLength(1);
  });
});
