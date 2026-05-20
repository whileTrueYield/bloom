// Pure rewriter that powers the Note-rename pipeline (#14). Given a body
// and an old → new title, return the body with every `[[old]]` and
// `[[old|display]]` retargeted to `[[new]]` / `[[new|display]]`. Anything
// else — aliases, partial matches, code blocks — is left untouched.

import { describe, it, expect } from "bun:test";
import { rewriteWikilinkTarget } from "@server/rewriteWikilink";

describe("rewriteWikilinkTarget", () => {
  it("returns the body unchanged when no references exist", () => {
    const result = rewriteWikilinkTarget(
      "no links here",
      "Old Title",
      "New Title",
    );
    expect(result.body).toBe("no links here");
    expect(result.count).toBe(0);
  });

  it("rewrites a plain [[Old Title]] reference", () => {
    const result = rewriteWikilinkTarget(
      "see [[Old Title]] for context",
      "Old Title",
      "New Title",
    );
    expect(result.body).toBe("see [[New Title]] for context");
    expect(result.count).toBe(1);
  });

  it("preserves the display label in piped [[Old|display]] references", () => {
    const result = rewriteWikilinkTarget(
      "see [[Old Title|the old one]] for context",
      "Old Title",
      "New Title",
    );
    expect(result.body).toBe("see [[New Title|the old one]] for context");
    expect(result.count).toBe(1);
  });

  it("rewrites every occurrence in the body", () => {
    const result = rewriteWikilinkTarget(
      "[[Old Title]] and [[Old Title|alias]] and [[Old Title]]",
      "Old Title",
      "New Title",
    );
    expect(result.body).toBe(
      "[[New Title]] and [[New Title|alias]] and [[New Title]]",
    );
    expect(result.count).toBe(3);
  });

  it("ignores references whose target does not exactly match the old title", () => {
    const result = rewriteWikilinkTarget(
      "[[Old]] [[Old Title Extra]] [[old title]]",
      "Old Title",
      "New Title",
    );
    // None of these match "Old Title" exactly — match is case-sensitive and
    // requires full equality (after trimming surrounding whitespace).
    expect(result.body).toBe("[[Old]] [[Old Title Extra]] [[old title]]");
    expect(result.count).toBe(0);
  });

  it("tolerates whitespace inside the brackets", () => {
    const result = rewriteWikilinkTarget(
      "see [[  Old Title  ]] and [[ Old Title | tag ]] ok",
      "Old Title",
      "New Title",
    );
    expect(result.body).toBe(
      "see [[New Title]] and [[New Title| tag ]] ok",
    );
    expect(result.count).toBe(2);
  });

  it("treats target characters that are regex-special as literals", () => {
    // A title with regex metacharacters shouldn't blow up the rewriter.
    const result = rewriteWikilinkTarget(
      "see [[C++ notes]] and [[C++ notes|cpp]]",
      "C++ notes",
      "Cpp notes",
    );
    expect(result.body).toBe("see [[Cpp notes]] and [[Cpp notes|cpp]]");
    expect(result.count).toBe(2);
  });
});
