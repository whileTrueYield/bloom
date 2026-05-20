// Decides what the Workspace should do when an SSE event arrives from
// /api/events. Pure function so the actual side effects (RTK Query
// invalidation, modal display) stay in the React layer where they belong.
//
// One of activeNoteId or activeDailyDate is set at a time (or neither, on the
// welcome view). The `dirty` flag means the active editor's buffer has
// unsaved keystrokes — whichever editor that happens to be.

import type { VaultEvent } from "@shared/types";

export interface EditorContext {
  activeNoteId: string | null;
  activeDailyDate: string | null;
  dirty: boolean;
}

export type ExternalReloadAction =
  | { kind: "reload-active" }       // refetch the active doc silently
  | { kind: "prompt-conflict" }     // dirty buffer vs. external edit
  | { kind: "prompt-deleted" }      // active doc was removed externally
  | { kind: "refresh-list" };       // sidebar only — editor untouched

export function decideExternalReloadAction(
  event: VaultEvent,
  ctx: EditorContext,
): ExternalReloadAction {
  if (event.kind === "note") {
    if (ctx.activeNoteId !== event.noteId) return { kind: "refresh-list" };
  } else {
    if (ctx.activeDailyDate !== event.dailyDate) return { kind: "refresh-list" };
  }
  if (event.action === "deleted") return { kind: "prompt-deleted" };
  return ctx.dirty
    ? { kind: "prompt-conflict" }
    : { kind: "reload-active" };
}
