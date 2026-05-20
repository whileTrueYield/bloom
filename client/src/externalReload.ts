// Decides what the Workspace should do when an SSE event arrives from
// /api/events. Pure function so the actual side effects (RTK Query
// invalidation, modal display) stay in the React layer where they belong.

import type { VaultEvent } from "@shared/types";

export interface EditorContext {
  activeNoteId: string | null;
  // True when the open Note's CodeMirror buffer has unsaved edits.
  dirty: boolean;
}

export type ExternalReloadAction =
  | { kind: "reload-active" }       // refetch the active Note silently
  | { kind: "prompt-conflict" }     // dirty buffer vs. external edit
  | { kind: "prompt-deleted" }      // active Note was removed externally
  | { kind: "refresh-list" };       // sidebar only — editor untouched

export function decideExternalReloadAction(
  event: VaultEvent,
  ctx: EditorContext,
): ExternalReloadAction {
  if (event.kind !== "note") {
    return { kind: "refresh-list" };
  }
  if (ctx.activeNoteId !== event.noteId) {
    return { kind: "refresh-list" };
  }
  if (event.action === "deleted") {
    return { kind: "prompt-deleted" };
  }
  return ctx.dirty
    ? { kind: "prompt-conflict" }
    : { kind: "reload-active" };
}
