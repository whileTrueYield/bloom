// Tests for the Daily Note Block parser. Pure-function tests against the
// canonical block format defined in slice #6.

import { describe, it, expect } from "bun:test";
import { parseDailyNoteBlocks } from "@server/blockParse";

describe("parseDailyNoteBlocks", () => {
  it("parses a single block with a time-only heading", () => {
    const body = "## 14:45\nfirst thought\n";
    const blocks = parseDailyNoteBlocks(body);
    expect(blocks).toEqual([
      { time: "14:45", geo: null, text: "first thought" },
    ]);
  });

  it("parses a block with time + geo heading including accuracy", () => {
    const body = "## 10:32 (48.8541, 2.3331 ±80m)\ncaught at the cafe\n";
    const blocks = parseDailyNoteBlocks(body);
    expect(blocks).toEqual([
      {
        time: "10:32",
        geo: { lat: 48.8541, lon: 2.3331, accuracy_m: 80 },
        text: "caught at the cafe",
      },
    ]);
  });

  it("parses multiple blocks separated by ---", () => {
    const body =
      "## 09:14\nfirst thought\n\n---\n\n## 10:32 (48.85, 2.33)\nsecond thought\n";
    const blocks = parseDailyNoteBlocks(body);
    expect(blocks).toEqual([
      { time: "09:14", geo: null, text: "first thought" },
      {
        time: "10:32",
        geo: { lat: 48.85, lon: 2.33, accuracy_m: null },
        text: "second thought",
      },
    ]);
  });

  it("returns an empty array for a body without any headings", () => {
    expect(parseDailyNoteBlocks("just some text")).toEqual([]);
    expect(parseDailyNoteBlocks("")).toEqual([]);
  });
});
