// Orchestrator for the Note rename pipeline (#14). Wraps the title-change
// detection, the multi-file rewrite, the rollback discipline, and the
// post-rewrite reindex. The HTTP layer becomes thin on top of this.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { bootstrapVaultLayout, createNote, loadNote, saveNote } from "@server/vault";
import { appendBlock } from "@server/dailyNote";
import { renameNote } from "@server/renameNote";
import type { Indexer } from "@server/indexer";

let vaultPath: string;
let indexer: RecordingIndexer;

interface RecordingIndexer extends Indexer {
  reindexedNotes: string[];
  reindexedDaily: string[];
  // Test hook: when set, the next indexer call throws.
  failOnce: { kind: "indexNote" | "indexDailyNote"; reason: string } | null;
}

function createRecordingIndexer(): RecordingIndexer {
  const i: RecordingIndexer = {
    reindexedNotes: [],
    reindexedDaily: [],
    failOnce: null,
    async indexNote(id) {
      if (i.failOnce?.kind === "indexNote") {
        const reason = i.failOnce.reason;
        i.failOnce = null;
        throw new Error(reason);
      }
      i.reindexedNotes.push(id);
    },
    async indexDailyNote(date) {
      if (i.failOnce?.kind === "indexDailyNote") {
        const reason = i.failOnce.reason;
        i.failOnce = null;
        throw new Error(reason);
      }
      i.reindexedDaily.push(date);
    },
    deleteNote() {},
    async rebuild() {
      return { notes: 0, daily: 0 };
    },
    search() {
      return [];
    },
    getBacklinks() {
      return [];
    },
    async stats() {
      return { notes: 0, daily: 0, blocks: 0, wikilinks: 0, sizeBytes: 0 };
    },
    close() {},
  };
  return i;
}

beforeEach(async () => {
  vaultPath = await mkdtemp(path.join(tmpdir(), "bloom-rename-"));
  await bootstrapVaultLayout(vaultPath);
  indexer = createRecordingIndexer();
});

afterEach(async () => {
  await rm(vaultPath, { recursive: true, force: true });
});

describe("renameNote", () => {
  it("just saves when the H1 is unchanged", async () => {
    const n = await createNote(vaultPath);
    await saveNote(vaultPath, n.id, "# Same Title\nbody");

    const result = await renameNote({
      vaultPath,
      indexer,
      noteId: n.id,
      newBody: "# Same Title\nbody edited",
    });

    expect(result.kind).toBe("saved");
    const reloaded = await loadNote(vaultPath, n.id);
    expect(reloaded.body).toBe("# Same Title\nbody edited");
    expect(indexer.reindexedNotes).toContain(n.id);
  });

  it("rewrites every [[Old Title]] across Notes and Daily Notes", async () => {
    const target = await createNote(vaultPath);
    await saveNote(vaultPath, target.id, "# Old Title\nbody");

    const source = await createNote(vaultPath);
    await saveNote(
      vaultPath,
      source.id,
      "# Source\nsee [[Old Title]] and [[Old Title|display]]",
    );
    const { date } = await appendBlock(vaultPath, {
      text: "from a Block: [[Old Title]]",
      now: new Date("2026-05-19T09:00:00"),
    });

    const result = await renameNote({
      vaultPath,
      indexer,
      noteId: target.id,
      newBody: "# New Title\nbody",
    });

    expect(result.kind).toBe("renamed");
    if (result.kind === "renamed") {
      expect(result.refsRewritten).toBe(3);
    }

    const sourceReloaded = await loadNote(vaultPath, source.id);
    expect(sourceReloaded.body).toContain("[[New Title]]");
    expect(sourceReloaded.body).toContain("[[New Title|display]]");

    const dailyRaw = await readFile(
      path.join(vaultPath, "daily", `${date}.md`),
      "utf8",
    );
    expect(dailyRaw).toContain("[[New Title]]");

    expect(indexer.reindexedNotes).toContain(target.id);
    expect(indexer.reindexedNotes).toContain(source.id);
    expect(indexer.reindexedDaily).toContain(date);
  });

  it("requires confirmation when more than 5 references would be rewritten", async () => {
    const target = await createNote(vaultPath);
    await saveNote(vaultPath, target.id, "# Old Title\n");

    // 6 source Notes referencing the title.
    for (let i = 0; i < 6; i++) {
      const s = await createNote(vaultPath);
      await saveNote(vaultPath, s.id, `# s${i}\nsee [[Old Title]]`);
    }

    const result = await renameNote({
      vaultPath,
      indexer,
      noteId: target.id,
      newBody: "# New Title\n",
    });

    expect(result.kind).toBe("needsConfirm");
    if (result.kind === "needsConfirm") {
      expect(result.plan.totalReferences).toBe(6);
      expect(result.plan.sources).toHaveLength(6);
    }
    // The Note itself must not have been saved yet.
    const reloaded = await loadNote(vaultPath, target.id);
    expect(reloaded.body).toBe("# Old Title");
    expect(indexer.reindexedNotes).toEqual([]);
  });

  it("executes the rewrite when confirmed=true with >5 references", async () => {
    const target = await createNote(vaultPath);
    await saveNote(vaultPath, target.id, "# Old Title\n");
    for (let i = 0; i < 6; i++) {
      const s = await createNote(vaultPath);
      await saveNote(vaultPath, s.id, `# s${i}\nsee [[Old Title]]`);
    }

    const result = await renameNote({
      vaultPath,
      indexer,
      noteId: target.id,
      newBody: "# New Title\n",
      renameConfirmed: true,
    });

    expect(result.kind).toBe("renamed");
    if (result.kind === "renamed") {
      expect(result.refsRewritten).toBe(6);
    }
  });

  it("rolls back every file when one source fails to write", async () => {
    const target = await createNote(vaultPath);
    await saveNote(vaultPath, target.id, "# Old Title\n");

    const s1 = await createNote(vaultPath);
    await saveNote(vaultPath, s1.id, "# s1\n[[Old Title]]");
    const s2 = await createNote(vaultPath);
    await saveNote(vaultPath, s2.id, "# s2\n[[Old Title]]");

    const s1Before = await readFile(
      path.join(vaultPath, "notes", `${s1.id}.md`),
      "utf8",
    );
    const s2Before = await readFile(
      path.join(vaultPath, "notes", `${s2.id}.md`),
      "utf8",
    );
    const targetBefore = await readFile(
      path.join(vaultPath, "notes", `${target.id}.md`),
      "utf8",
    );

    // Force the second source's path to fail by passing a writeOverride that
    // throws on a specific path. The orchestrator surfaces the failure and
    // rolls back everything written so far.
    await expect(
      renameNote({
        vaultPath,
        indexer,
        noteId: target.id,
        newBody: "# New Title\n",
        writeFileOverride: async (filePath, contents) => {
          if (filePath.endsWith(`${s2.id}.md`)) {
            throw new Error("simulated EIO");
          }
          await (await import("node:fs/promises")).writeFile(filePath, contents);
        },
      }),
    ).rejects.toThrow(/simulated EIO/);

    // Every file should match its pre-call bytes.
    const s1After = await readFile(
      path.join(vaultPath, "notes", `${s1.id}.md`),
      "utf8",
    );
    const s2After = await readFile(
      path.join(vaultPath, "notes", `${s2.id}.md`),
      "utf8",
    );
    const targetAfter = await readFile(
      path.join(vaultPath, "notes", `${target.id}.md`),
      "utf8",
    );

    expect(s1After).toBe(s1Before);
    expect(s2After).toBe(s2Before);
    expect(targetAfter).toBe(targetBefore);
    // No reindex calls because nothing successfully changed.
    expect(indexer.reindexedNotes).toEqual([]);
  });
});
