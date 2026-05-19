// Two-pane workspace shown once a Vault is configured: sidebar of Notes on
// the left, CodeMirror editor on the right. Owns the "which note is open"
// state and orchestrates Cmd+N + debounced save. Future slices replace the
// sidebar with a richer navigation surface and add the right-side AI panel.

import { useCallback, useEffect, useMemo, useState } from "react";
import { NoteEditor } from "./NoteEditor";
import { NotesSidebar } from "./NotesSidebar";
import {
  useCreateNoteMutation,
  useGetNoteQuery,
  useSaveNoteMutation,
} from "./notesApi";
import { debounce } from "./debounce";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function Workspace() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const { data: activeNote } = useGetNoteQuery(activeId ?? "", {
    skip: !activeId,
  });
  const [createNote] = useCreateNoteMutation();
  const [saveNote] = useSaveNoteMutation();

  const onCreate = useCallback(async () => {
    const note = await createNote({}).unwrap();
    setActiveId(note.id);
  }, [createNote]);

  // Global Cmd+N — create a new Note and open it in the editor.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        void onCreate();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCreate]);

  // Debounced save (~500ms). The editor pushes every keystroke; we coalesce.
  const debouncedSave = useMemo(
    () =>
      debounce((id: string, body: string) => {
        setSaveStatus("saving");
        saveNote({ id, body })
          .unwrap()
          .then(() => setSaveStatus("saved"))
          .catch(() => setSaveStatus("error"));
      }, 500),
    [saveNote],
  );

  // Flush any pending save when the user navigates away from the page.
  useEffect(() => {
    const onBeforeUnload = () => debouncedSave.flush();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      debouncedSave.cancel();
    };
  }, [debouncedSave]);

  const handleEditorChange = useCallback(
    (body: string) => {
      if (!activeId) return;
      setSaveStatus("idle");
      debouncedSave(activeId, body);
    },
    [activeId, debouncedSave],
  );

  return (
    <div style={{ display: "flex", gap: "1rem", padding: "1rem 1.5rem" }}>
      <aside style={{ flex: "0 0 14rem" }}>
        <button
          onClick={onCreate}
          style={{ width: "100%", padding: "0.5rem", marginBottom: "0.75rem" }}
        >
          + New Note (⌘N)
        </button>
        <NotesSidebar activeId={activeId} onOpen={setActiveId} />
      </aside>

      <section style={{ flex: 1, minHeight: "20rem" }}>
        {activeId && activeNote ? (
          <>
            <NoteEditor
              key={activeNote.id}
              noteId={activeNote.id}
              initialBody={activeNote.body}
              onChange={handleEditorChange}
            />
            <p style={{ color: "#888", fontSize: "0.8125rem", marginTop: "0.5rem" }}>
              {saveStatus === "idle" && "Editing"}
              {saveStatus === "saving" && "Saving…"}
              {saveStatus === "saved" && "Saved"}
              {saveStatus === "error" && "Save failed"}
            </p>
          </>
        ) : (
          <p style={{ color: "#888" }}>
            Pick a Note from the sidebar, or press <kbd>⌘N</kbd> to create one.
          </p>
        )}
      </section>
    </div>
  );
}
