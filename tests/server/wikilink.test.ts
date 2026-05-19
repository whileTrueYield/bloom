// Wikilink module tests. Pure-function tests for the markdown parsers, and
// API-level tests for the resolver endpoint. The resolver works against a
// real Vault and real Notes — no mocks at the boundary the user sees.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  extractTitle,
  extractWikilinks,
  suggestWikilinks,
} from "@server/wikilink";
import { bootstrapVaultLayout, createNote, saveNote } from "@server/vault";

describe("extractTitle", () => {
  it("returns the first H1 from a markdown body", () => {
    const body = "# Zettelkasten as thinking tool\n\nBody text here.";
    expect(extractTitle(body)).toBe("Zettelkasten as thinking tool");
  });

  it("returns null when the body has no H1", () => {
    expect(extractTitle("Just some prose.")).toBeNull();
    expect(extractTitle("## Not a Title\nbody")).toBeNull();
    expect(extractTitle("")).toBeNull();
  });
});

describe("extractWikilinks", () => {
  it("finds plain [[target]] references in a body", () => {
    const body = "See [[zettelkasten]] and also [[note-taking]] for context.";
    expect(extractWikilinks(body)).toEqual(["zettelkasten", "note-taking"]);
  });

  it("returns an empty array when there are no wikilinks", () => {
    expect(extractWikilinks("plain prose")).toEqual([]);
  });

  it("extracts the target from [[target|display]] syntax", () => {
    const body = "See [[zettelkasten|the method]] for details.";
    expect(extractWikilinks(body)).toEqual(["zettelkasten"]);
  });
});

describe("suggestWikilinks", () => {
  let vaultPath: string;

  beforeEach(async () => {
    vaultPath = await mkdtemp(path.join(tmpdir(), "bloom-suggest-"));
    await bootstrapVaultLayout(vaultPath);
  });

  afterEach(async () => {
    await rm(vaultPath, { recursive: true, force: true });
  });

  it("returns notes whose title starts with the query (tier 1)", async () => {
    const note = await createNote(vaultPath);
    await saveNote(vaultPath, note.id, "# Zettelkasten\n\nbody");

    const results = await suggestWikilinks(vaultPath, "Zett");
    expect(results.map((r) => r.title)).toEqual(["Zettelkasten"]);
    expect(results[0]!.id).toBe(note.id);
    expect(results[0]!.tier).toBe(1);
  });

  it("ranks tier-1 (prefix) results above tier-2 (substring)", async () => {
    // Title that starts with "think" (tier 1)
    const a = await createNote(vaultPath);
    await saveNote(vaultPath, a.id, "# thinking deeply\n\nbody");

    // Title that contains "think" but doesn't start with it (tier 2)
    const b = await createNote(vaultPath);
    await saveNote(vaultPath, b.id, "# Zettelkasten as thinking tool\n\nbody");

    const results = await suggestWikilinks(vaultPath, "think");
    expect(results.map((r) => r.title)).toEqual([
      "thinking deeply",
      "Zettelkasten as thinking tool",
    ]);
    expect(results[0]!.tier).toBe(1);
    expect(results[1]!.tier).toBe(2);
  });

  it("sorts within a tier by modified desc (most recent first)", async () => {
    const a = await createNote(vaultPath, {
      now: new Date("2026-05-10T10:00:00.000Z"),
    });
    await saveNote(vaultPath, a.id, "# zen practice\n\n1");

    const b = await createNote(vaultPath, {
      now: new Date("2026-05-12T10:00:00.000Z"),
    });
    await saveNote(vaultPath, b.id, "# zen garden\n\n2");

    // Touch a *after* b so a becomes most recently modified despite older id.
    await new Promise((r) => setTimeout(r, 1100));
    await saveNote(vaultPath, a.id, "# zen practice\n\n1 — updated");

    const results = await suggestWikilinks(vaultPath, "zen");
    expect(results.map((r) => r.title)).toEqual([
      "zen practice", // touched most recently
      "zen garden",
    ]);
  });

  it("returns an empty array when nothing matches", async () => {
    const note = await createNote(vaultPath);
    await saveNote(vaultPath, note.id, "# Existing\n\nbody");
    expect(await suggestWikilinks(vaultPath, "nope")).toEqual([]);
  });

  it("caps the result count at the given limit", async () => {
    for (let i = 0; i < 5; i++) {
      const n = await createNote(vaultPath);
      await saveNote(vaultPath, n.id, `# alpha-${i}\n\nbody`);
    }
    const limited = await suggestWikilinks(vaultPath, "alpha", 3);
    expect(limited).toHaveLength(3);
  });
});
