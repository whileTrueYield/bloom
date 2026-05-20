// Tiny slice that lifts editor-adjacent state out of <Workspace> so a sibling
// <StatusBar> rendered at the App shell can read it without a context wire.
// Only two things are tracked here: the save lifecycle (idle/saving/saved/error)
// and the latest editor buffer for live word-count computation. Everything
// else the StatusBar shows comes from existing RTK Query caches.

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface EditorStatusState {
  saveStatus: SaveStatus;
  buffer: string | null;
}

const initialState: EditorStatusState = {
  saveStatus: "idle",
  buffer: null,
};

const slice = createSlice({
  name: "editorStatus",
  initialState,
  reducers: {
    setSaveStatus(state, action: PayloadAction<SaveStatus>) {
      state.saveStatus = action.payload;
    },
    setBuffer(state, action: PayloadAction<string>) {
      state.buffer = action.payload;
    },
    clearBuffer(state) {
      state.buffer = null;
    },
  },
});

export const { setSaveStatus, setBuffer, clearBuffer } = slice.actions;
export const editorStatusReducer = slice.reducer;
