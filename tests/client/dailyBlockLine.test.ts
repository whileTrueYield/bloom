// findBlockLine maps a Block index to the line number of its heading inside
// a Daily Note body. Used to scroll the editor to a deep-linked Block.

import { describe, it, expect } from "bun:test";
import { findBlockLine } from "../../client/src/dailyBlockLine";

describe("findBlockLine", () => {
  it("returns 0 for the first Block", () => {
    const body = `## 09:14\nfirst thought\n\n---\n\n## 10:32\nsecond thought\n`;
    expect(findBlockLine(body, 0)).toBe(0);
  });

  it("returns the heading line of a later Block", () => {
    const body = `## 09:14\nfirst thought\n\n---\n\n## 10:32\nsecond thought\n`;
    // Lines: 0 "## 09:14", 1 "first thought", 2 "", 3 "---", 4 "",
    //        5 "## 10:32", 6 "second thought", 7 ""
    expect(findBlockLine(body, 1)).toBe(5);
  });

  it("ignores headings inside Block text", () => {
    // A user-typed `## reference` inside a Block must not be counted as a Block
    // boundary — Block headings start with HH:MM.
    const body = `## 09:14\nintro\n## reference\nmore text\n\n---\n\n## 10:32\nsecond\n`;
    expect(findBlockLine(body, 1)).toBe(7);
  });

  it("returns null when the index is out of range", () => {
    const body = `## 09:14\nonly block\n`;
    expect(findBlockLine(body, 1)).toBeNull();
  });

  it("returns null for an empty body", () => {
    expect(findBlockLine("", 0)).toBeNull();
  });
});
