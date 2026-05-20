// Pure decision mapper that the Workspace uses to react to /api/events:
// given the currently open Note and its dirty flag, what should the UI do?

import { describe, it, expect } from "bun:test";
import { decideExternalReloadAction } from "../../client/src/externalReload";
import type { VaultEvent } from "@shared/types";

const noteChanged = (noteId: string): VaultEvent => ({
  kind: "note",
  noteId,
  action: "changed",
});
const noteDeleted = (noteId: string): VaultEvent => ({
  kind: "note",
  noteId,
  action: "deleted",
});
const dailyChanged: VaultEvent = {
  kind: "daily",
  dailyDate: "2026-05-19",
  action: "changed",
};

describe("decideExternalReloadAction", () => {
  it("ignores events for a Note that isn't currently open", () => {
    expect(
      decideExternalReloadAction(noteChanged("other"), { activeNoteId: "open", dirty: false }),
    ).toEqual({ kind: "refresh-list" });
  });

  it("silently reloads the active Note when the buffer is clean", () => {
    expect(
      decideExternalReloadAction(noteChanged("open"), { activeNoteId: "open", dirty: false }),
    ).toEqual({ kind: "reload-active" });
  });

  it("prompts when the active Note changed externally with a dirty buffer", () => {
    expect(
      decideExternalReloadAction(noteChanged("open"), { activeNoteId: "open", dirty: true }),
    ).toEqual({ kind: "prompt-conflict" });
  });

  it("warns when the active Note is deleted out from under the editor", () => {
    expect(
      decideExternalReloadAction(noteDeleted("open"), { activeNoteId: "open", dirty: false }),
    ).toEqual({ kind: "prompt-deleted" });
  });

  it("refreshes the list (and nothing else) for a Daily Note change", () => {
    expect(
      decideExternalReloadAction(dailyChanged, { activeNoteId: "open", dirty: false }),
    ).toEqual({ kind: "refresh-list" });
  });

  it("refreshes the list when no Note is open", () => {
    expect(
      decideExternalReloadAction(noteChanged("any"), { activeNoteId: null, dirty: false }),
    ).toEqual({ kind: "refresh-list" });
  });
});
