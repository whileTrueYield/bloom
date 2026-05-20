// editorStatus slice owns transient editor-side state that the StatusBar
// reads from outside the Workspace tree: save status and the latest doc
// body (so word count stays live without lifting the buffer everywhere).

import { describe, it, expect } from "bun:test";
import {
  editorStatusReducer,
  setSaveStatus,
  setBuffer,
  clearBuffer,
} from "../../client/src/editorStatusSlice";

describe("editorStatus reducer", () => {
  const initial = editorStatusReducer(undefined, { type: "@@INIT" });

  it("starts idle with no buffer", () => {
    expect(initial).toEqual({ saveStatus: "idle", buffer: null });
  });

  it("records save status transitions", () => {
    const saving = editorStatusReducer(initial, setSaveStatus("saving"));
    expect(saving.saveStatus).toBe("saving");
    const saved = editorStatusReducer(saving, setSaveStatus("saved"));
    expect(saved.saveStatus).toBe("saved");
  });

  it("records and clears the open doc's buffer", () => {
    const withBuffer = editorStatusReducer(
      initial,
      setBuffer("hello world"),
    );
    expect(withBuffer.buffer).toBe("hello world");
    const cleared = editorStatusReducer(withBuffer, clearBuffer());
    expect(cleared.buffer).toBeNull();
  });
});
