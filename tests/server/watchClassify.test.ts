// Pure path classification for the Vault watcher. Tells the watcher what
// kind of file changed and extracts the id/date that the Indexer needs.

import { describe, it, expect } from "bun:test";
import path from "node:path";
import { classifyVaultPath } from "@server/watchClassify";

const vault = "/v";

describe("classifyVaultPath", () => {
  it("classifies a Note markdown file by id", () => {
    expect(classifyVaultPath(vault, path.join(vault, "notes", "20260519T100000000.md"))).toEqual({
      kind: "note",
      noteId: "20260519T100000000",
    });
  });

  it("classifies a Daily Note markdown file by date", () => {
    expect(classifyVaultPath(vault, path.join(vault, "daily", "2026-05-19.md"))).toEqual({
      kind: "daily",
      dailyDate: "2026-05-19",
    });
  });

  it("ignores attachments and unknown subdirs", () => {
    expect(classifyVaultPath(vault, path.join(vault, "attachments", "cat.png"))).toEqual({
      kind: "ignored",
    });
    expect(classifyVaultPath(vault, path.join(vault, "trash", "old.md"))).toEqual({
      kind: "ignored",
    });
  });

  it("ignores non-markdown files in notes/ and daily/", () => {
    expect(classifyVaultPath(vault, path.join(vault, "notes", ".DS_Store"))).toEqual({
      kind: "ignored",
    });
    expect(classifyVaultPath(vault, path.join(vault, "daily", "notes.txt"))).toEqual({
      kind: "ignored",
    });
  });

  it("ignores tmp files produced by Bloom's atomic save (notes/<id>.md.tmp-*)", () => {
    expect(
      classifyVaultPath(vault, path.join(vault, "notes", "20260519T100000000.md.tmp-12345-99")),
    ).toEqual({ kind: "ignored" });
  });

  it("returns ignored for a path outside the vault root", () => {
    expect(classifyVaultPath(vault, "/somewhere/else/notes/x.md")).toEqual({
      kind: "ignored",
    });
  });
});
