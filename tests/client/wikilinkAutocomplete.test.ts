// Tests for the pure edit-math used by the wikilink autocomplete's `apply`
// handler. The full CodeMirror integration is verified by hand; this layer
// asserts the boundary conditions where we historically broke
// (over-inserting the typed prefix, duplicating the closing braces).

import { describe, it, expect } from "bun:test";
import { buildWikilinkEdit } from "@client/wikilinkAutocomplete";

describe("buildWikilinkEdit", () => {
  it("replaces the typed prefix and appends closing braces when nothing follows", () => {
    // Doc: `[[an` (cursor at end). from=2 (after [[), to=4.
    // Result should be `[[another]]` with cursor parked after the braces.
    expect(buildWikilinkEdit(2, 4, "", "another")).toEqual({
      from: 2,
      to: 4,
      insert: "another]]",
      cursorAt: 11,
    });
  });

  it("consumes a trailing ]] instead of duplicating it", () => {
    // Doc: `[[an]]` with cursor between `n` and `]`. from=2, to=4, after=`]]`.
    // Without this consume, the result would be `[[another]]]]` — the bug.
    expect(buildWikilinkEdit(2, 4, "]]", "another")).toEqual({
      from: 2,
      to: 6,
      insert: "another]]",
      cursorAt: 11,
    });
  });

  it("does not consume when the next two characters are not ]]", () => {
    // Doc: `[[an stuff` (cursor after `n`). after=` s` — leave the rest
    // alone, just insert title + braces at the cursor.
    expect(buildWikilinkEdit(2, 4, " s", "another")).toEqual({
      from: 2,
      to: 4,
      insert: "another]]",
      cursorAt: 11,
    });
  });

  it("handles the empty-query case (cursor sits right after [[)", () => {
    // Doc: `[[` (cursor at position 2). from=to=2, after="".
    expect(buildWikilinkEdit(2, 2, "", "another")).toEqual({
      from: 2,
      to: 2,
      insert: "another]]",
      cursorAt: 11,
    });
  });

  it("handles the empty-query case with existing closing braces", () => {
    // Doc: `[[]]` with cursor between braces. from=to=2, after="]]".
    expect(buildWikilinkEdit(2, 2, "]]", "another")).toEqual({
      from: 2,
      to: 4,
      insert: "another]]",
      cursorAt: 11,
    });
  });
});
