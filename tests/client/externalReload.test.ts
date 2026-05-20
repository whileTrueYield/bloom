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
const dailyChanged = (date: string): VaultEvent => ({
  kind: "daily",
  dailyDate: date,
  action: "changed",
});
const dailyDeleted = (date: string): VaultEvent => ({
  kind: "daily",
  dailyDate: date,
  action: "deleted",
});

const ctx = (over: Partial<{
  activeNoteId: string | null;
  activeDailyDate: string | null;
  dirty: boolean;
}> = {}) => ({
  activeNoteId: null,
  activeDailyDate: null,
  dirty: false,
  ...over,
});

describe("decideExternalReloadAction", () => {
  it("ignores events for a Note that isn't currently open", () => {
    expect(
      decideExternalReloadAction(noteChanged("other"), ctx({ activeNoteId: "open" })),
    ).toEqual({ kind: "refresh-list" });
  });

  it("silently reloads the active Note when the buffer is clean", () => {
    expect(
      decideExternalReloadAction(noteChanged("open"), ctx({ activeNoteId: "open" })),
    ).toEqual({ kind: "reload-active" });
  });

  it("prompts when the active Note changed externally with a dirty buffer", () => {
    expect(
      decideExternalReloadAction(noteChanged("open"), ctx({ activeNoteId: "open", dirty: true })),
    ).toEqual({ kind: "prompt-conflict" });
  });

  it("warns when the active Note is deleted out from under the editor", () => {
    expect(
      decideExternalReloadAction(noteDeleted("open"), ctx({ activeNoteId: "open" })),
    ).toEqual({ kind: "prompt-deleted" });
  });

  it("refreshes the list for a Daily Note change when no Daily is open", () => {
    expect(
      decideExternalReloadAction(dailyChanged("2026-05-19"), ctx()),
    ).toEqual({ kind: "refresh-list" });
  });

  it("refreshes the list when a different Daily Note changes", () => {
    expect(
      decideExternalReloadAction(
        dailyChanged("2026-05-18"),
        ctx({ activeDailyDate: "2026-05-19" }),
      ),
    ).toEqual({ kind: "refresh-list" });
  });

  it("silently reloads the active Daily Note when its buffer is clean", () => {
    expect(
      decideExternalReloadAction(
        dailyChanged("2026-05-19"),
        ctx({ activeDailyDate: "2026-05-19" }),
      ),
    ).toEqual({ kind: "reload-active" });
  });

  it("prompts when the active Daily Note changed externally with a dirty buffer", () => {
    expect(
      decideExternalReloadAction(
        dailyChanged("2026-05-19"),
        ctx({ activeDailyDate: "2026-05-19", dirty: true }),
      ),
    ).toEqual({ kind: "prompt-conflict" });
  });

  it("warns when the active Daily Note is deleted out from under the editor", () => {
    expect(
      decideExternalReloadAction(
        dailyDeleted("2026-05-19"),
        ctx({ activeDailyDate: "2026-05-19" }),
      ),
    ).toEqual({ kind: "prompt-deleted" });
  });

  it("refreshes the list when no doc is open", () => {
    expect(
      decideExternalReloadAction(noteChanged("any"), ctx()),
    ).toEqual({ kind: "refresh-list" });
  });
});
