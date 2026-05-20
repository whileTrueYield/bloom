// Walks every Note and Daily Note in a Vault, returning a plan for the
// rename pipeline: which source files contain `[[oldTitle]]` references,
// how many each, and the post-rewrite body to write.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import matter from "gray-matter";
import { bootstrapVaultLayout, createNote, saveNote } from "@server/vault";
import { appendBlock } from "@server/dailyNote";
import { findNoteReferences } from "@server/findNoteReferences";

let vaultPath: string;

beforeEach(async () => {
  vaultPath = await mkdtemp(path.join(tmpdir(), "bloom-refs-"));
  await bootstrapVaultLayout(vaultPath);
});

afterEach(async () => {
  await rm(vaultPath, { recursive: true, force: true });
});

describe("findNoteReferences", () => {
  it("returns an empty plan when nothing references the title", async () => {
    await createNote(vaultPath);
    const plan = await findNoteReferences(vaultPath, "Old Title", "New Title");
    expect(plan.sources).toEqual([]);
    expect(plan.totalReferences).toBe(0);
  });

  it("lists every Note source that contains `[[Old Title]]` or `[[Old Title|x]]`", async () => {
    const n1 = await createNote(vaultPath);
    await saveNote(vaultPath, n1.id, "# Source A\nsee [[Old Title]] here");
    const n2 = await createNote(vaultPath);
    await saveNote(
      vaultPath,
      n2.id,
      "# Source B\nsee [[Old Title|the old]] and again [[Old Title]]",
    );
    const n3 = await createNote(vaultPath);
    await saveNote(vaultPath, n3.id, "# Source C\nno links");

    const plan = await findNoteReferences(vaultPath, "Old Title", "New Title");
    expect(plan.totalReferences).toBe(3);
    const ids = plan.sources
      .filter((s) => s.kind === "note")
      .map((s) => (s.kind === "note" ? s.noteId : ""))
      .sort();
    expect(ids).toEqual([n1.id, n2.id].sort());
    const n2Source = plan.sources.find(
      (s) => s.kind === "note" && s.noteId === n2.id,
    );
    expect(n2Source?.count).toBe(2);
    expect(n2Source?.newBody).toContain("[[New Title]]");
    expect(n2Source?.newBody).toContain("[[New Title|the old]]");
  });

  it("includes Daily Note sources whose Blocks reference the title", async () => {
    await appendBlock(vaultPath, {
      text: "thought about [[Old Title]] today",
      now: new Date("2026-05-19T09:00:00"),
    });
    await appendBlock(vaultPath, {
      text: "and again [[Old Title|tag]]",
      now: new Date("2026-05-19T10:00:00"),
    });
    await appendBlock(vaultPath, {
      text: "unrelated",
      now: new Date("2026-05-20T09:00:00"),
    });

    const plan = await findNoteReferences(vaultPath, "Old Title", "New Title");
    expect(plan.totalReferences).toBe(2);
    const dailies = plan.sources.filter((s) => s.kind === "daily");
    expect(dailies).toHaveLength(1);
    const dailySource = dailies[0]!;
    if (dailySource.kind === "daily") {
      expect(dailySource.dailyDate).toBe("2026-05-19");
      expect(dailySource.count).toBe(2);
      expect(dailySource.newBody).toContain("[[New Title]]");
      expect(dailySource.newBody).toContain("[[New Title|tag]]");
    }
  });

  it("skips references whose link text is an alias of some Note (not equal to the title)", async () => {
    // Note A's H1 is "Old Title" with an alias "shortcut". When we look for
    // references to "Old Title", we must NOT pick up `[[shortcut]]` because
    // the rewriter only swaps exact-title matches; aliases stay as the user
    // wrote them.
    const a = await createNote(vaultPath);
    const aPath = path.join(vaultPath, "notes", `${a.id}.md`);
    await writeFile(
      aPath,
      matter.stringify("# Old Title", {
        id: a.id,
        created: new Date().toISOString(),
        geo: { lat: null, lon: null, place: null, accuracy_m: null },
        aliases: ["shortcut"],
      }),
    );
    const b = await createNote(vaultPath);
    await saveNote(vaultPath, b.id, "# Source\nvia [[shortcut]] here");

    const plan = await findNoteReferences(vaultPath, "Old Title", "New Title");
    expect(plan.totalReferences).toBe(0);
    expect(plan.sources).toEqual([]);
  });

  // newBody is what we'll actually write — the rewriter is parameterized on
  // newTitle so the plan is execute-ready, no second pass needed.
  it("accepts the new title and stores execute-ready bodies", async () => {
    const n = await createNote(vaultPath);
    await saveNote(vaultPath, n.id, "# x\n[[Old Title]]");

    const plan = await findNoteReferences(vaultPath, "Old Title", "Brand New");
    const noteSource = plan.sources[0]!;
    expect(noteSource.newBody).toContain("[[Brand New]]");
  });
});
