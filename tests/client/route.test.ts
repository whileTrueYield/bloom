// URL-hash routing for the Workspace. The hash carries which Note or Daily
// Note is open and, for Daily Notes, optionally which Block to scroll to.
// These tests pin the wire format so the bookmarks people copy keep working.

import { describe, it, expect } from "bun:test";
import { parseRoute, formatRoute, type Route } from "../../client/src/route";

describe("parseRoute", () => {
  it("returns 'none' for an empty hash", () => {
    expect(parseRoute("")).toEqual({ kind: "none" });
    expect(parseRoute("#")).toEqual({ kind: "none" });
  });

  it("decodes a Note id", () => {
    expect(parseRoute("#note/abc-123")).toEqual({
      kind: "note",
      noteId: "abc-123",
    });
  });

  it("URL-decodes Note ids", () => {
    expect(parseRoute("#note/hello%20world")).toEqual({
      kind: "note",
      noteId: "hello world",
    });
  });

  it("parses a Daily Note date alone", () => {
    expect(parseRoute("#daily/2026-05-20")).toEqual({
      kind: "daily",
      date: "2026-05-20",
      blockIndex: null,
    });
  });

  it("parses a Daily Note date with a Block index", () => {
    expect(parseRoute("#daily/2026-05-20/b/3")).toEqual({
      kind: "daily",
      date: "2026-05-20",
      blockIndex: 3,
    });
  });

  it("rejects malformed daily routes", () => {
    expect(parseRoute("#daily/not-a-date")).toEqual({ kind: "none" });
    expect(parseRoute("#daily/2026-05-20/b/abc")).toEqual({ kind: "none" });
    expect(parseRoute("#daily/")).toEqual({ kind: "none" });
  });

  it("parses the settings hash", () => {
    expect(parseRoute("#settings")).toEqual({ kind: "settings" });
  });

  it("rejects unknown hash shapes", () => {
    expect(parseRoute("#whatever")).toEqual({ kind: "none" });
  });
});

describe("formatRoute", () => {
  it("formats 'none' as an empty string", () => {
    expect(formatRoute({ kind: "none" })).toBe("");
  });

  it("URL-encodes Note ids", () => {
    expect(formatRoute({ kind: "note", noteId: "abc 123" })).toBe(
      "#note/abc%20123",
    );
  });

  it("formats a Daily Note date with no Block as just the date", () => {
    expect(
      formatRoute({ kind: "daily", date: "2026-05-20", blockIndex: null }),
    ).toBe("#daily/2026-05-20");
  });

  it("formats a Daily Note date with a Block index", () => {
    expect(
      formatRoute({ kind: "daily", date: "2026-05-20", blockIndex: 3 }),
    ).toBe("#daily/2026-05-20/b/3");
  });

  it("formats settings", () => {
    expect(formatRoute({ kind: "settings" })).toBe("#settings");
  });

  it("round-trips through parseRoute", () => {
    const routes: Route[] = [
      { kind: "none" },
      { kind: "note", noteId: "abc-123" },
      { kind: "daily", date: "2026-05-20", blockIndex: null },
      { kind: "daily", date: "2026-05-20", blockIndex: 7 },
      { kind: "settings" },
    ];
    for (const r of routes) {
      expect(parseRoute(formatRoute(r))).toEqual(r);
    }
  });
});
