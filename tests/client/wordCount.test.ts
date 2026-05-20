// wordCount drives the status bar's live count for whichever doc is open.
// "Words" here means human-meaningful tokens, so markdown syntax (#, ---,
// [[...]]) shouldn't inflate the count.

import { describe, it, expect } from "bun:test";
import { wordCount } from "../../client/src/wordCount";

describe("wordCount", () => {
  it("returns 0 for an empty body", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount("   \n  ")).toBe(0);
  });

  it("counts plain words", () => {
    expect(wordCount("hello world")).toBe(2);
  });

  it("ignores markdown heading markers", () => {
    expect(wordCount("# Title here\nbody words")).toBe(4);
  });

  it("ignores horizontal rule separators", () => {
    expect(wordCount("first block\n---\nsecond block")).toBe(4);
  });

  it("counts the visible text inside a wikilink, not the brackets", () => {
    expect(wordCount("see [[Atomic Notes]] for context")).toBe(5);
  });

  it("counts the display half of a piped wikilink", () => {
    expect(wordCount("see [[Atomic Notes|atoms]] for context")).toBe(4);
  });

  it("collapses runs of whitespace and punctuation", () => {
    expect(wordCount("hello,    world!   foo... bar")).toBe(4);
  });
});
