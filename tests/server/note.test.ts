// Note module tests. Each test gets a freshly bootstrapped vault in a temp
// directory so behavior is observable end-to-end through real FS round-trips.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import matter from "gray-matter";
import { bootstrapVaultLayout, createNote, listNotes, loadNote, saveNote } from "@server/vault";

let vaultPath: string;

beforeEach(async () => {
  vaultPath = await mkdtemp(path.join(tmpdir(), "bloom-note-"));
  await bootstrapVaultLayout(vaultPath);
});

afterEach(async () => {
  await rm(vaultPath, { recursive: true, force: true });
});

describe("createNote", () => {
  it("writes a markdown file under notes/ with valid frontmatter and empty body", async () => {
    const note = await createNote(vaultPath);

    expect(note.id).toMatch(/^\d{8}T\d{9}$/);   // YYYYMMDDTHHMMSSsss
    expect(note.path).toBe(path.join(vaultPath, "notes", `${note.id}.md`));
    expect(note.body).toBe("");

    const raw = await readFile(note.path, "utf8");
    const parsed = matter(raw);
    expect(parsed.data.id).toBe(note.id);
    expect(typeof parsed.data.created).toBe("string");
    expect(parsed.data.geo).toEqual({
      lat: null,
      lon: null,
      place: null,
      accuracy_m: null,
    });
    expect(parsed.content.trim()).toBe("");
  });

  it("generates distinct ids when called twice in the same millisecond", async () => {
    const now = new Date("2026-05-18T20:34:11.000Z");
    const a = await createNote(vaultPath, { now });
    const b = await createNote(vaultPath, { now });
    expect(a.id).not.toBe(b.id);
    expect(a.path).not.toBe(b.path);
  });
});

describe("loadNote", () => {
  it("round-trips a created note", async () => {
    const created = await createNote(vaultPath);
    const loaded = await loadNote(vaultPath, created.id);
    expect(loaded.id).toBe(created.id);
    expect(loaded.path).toBe(created.path);
    expect(loaded.body).toBe(created.body);
    expect(loaded.frontmatter).toEqual(created.frontmatter);
  });
});

describe("saveNote", () => {
  it("updates the body, preserves the frontmatter, and bumps modified", async () => {
    const created = await createNote(vaultPath);
    const initialModified = created.modified;

    // Make sure the mtime changes — FS mtime is per-second on some filesystems.
    await new Promise((r) => setTimeout(r, 1100));

    const saved = await saveNote(vaultPath, created.id, "# Hello\n\nA body.");

    expect(saved.body).toBe("# Hello\n\nA body.");
    expect(saved.frontmatter).toEqual(created.frontmatter);
    expect(new Date(saved.modified).getTime()).toBeGreaterThan(
      new Date(initialModified).getTime(),
    );

    const reloaded = await loadNote(vaultPath, created.id);
    expect(reloaded.body).toBe("# Hello\n\nA body.");
    expect(reloaded.frontmatter).toEqual(created.frontmatter);
  });
});

describe("listNotes", () => {
  it("returns notes sorted by modified desc (most recent first)", async () => {
    const a = await createNote(vaultPath, { now: new Date("2026-05-18T10:00:00.000Z") });
    const b = await createNote(vaultPath, { now: new Date("2026-05-18T10:00:00.001Z") });
    const c = await createNote(vaultPath, { now: new Date("2026-05-18T10:00:00.002Z") });

    // Touch b after c via a real save so b becomes most recently modified.
    await new Promise((r) => setTimeout(r, 1100));
    await saveNote(vaultPath, b.id, "edited");

    const list = await listNotes(vaultPath);
    expect(list.map((n) => n.id)).toEqual([b.id, c.id, a.id]);
  });

  it("returns an empty array when the vault has no notes", async () => {
    const list = await listNotes(vaultPath);
    expect(list).toEqual([]);
  });
});
