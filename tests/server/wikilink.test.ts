// Wikilink module tests. Pure-function tests for the markdown parsers, and
// API-level tests for the resolver endpoint. The resolver works against a
// real Vault and real Notes — no mocks at the boundary the user sees.

import { describe, it, expect } from "bun:test";
import { extractTitle, extractWikilinks } from "@server/wikilink";

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
