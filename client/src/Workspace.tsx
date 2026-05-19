// Two-pane workspace shown once a Vault is configured: sidebar of Notes on
// the left, CodeMirror editor on the right. Owns hotkeys and orchestrates
// wikilink resolution / creation.
//
// The "which note is open" state lives in the URL hash (see useNoteRoute),
// so browser back/forward — and our ⌘[ / ⌘] bindings — work for free.
//
// Why ⌘J for "new Note" instead of the obvious ⌘N: browsers hard-reserve
// ⌘N (new window) and ⌘⇧N (new incognito) at the system level, so
// preventDefault is a no-op. ⌘J is free across the major browsers.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { WikilinkSuggestion } from "@shared/types";
import { NoteEditor } from "./NoteEditor";
import { NotesSidebar } from "./NotesSidebar";
import { CaptureModal } from "./CaptureModal";
import {
  useCreateNoteMutation,
  useGetNoteQuery,
  useSaveNoteMutation,
} from "./notesApi";
import { debounce } from "./debounce";
import { useNoteRoute } from "./useNoteRoute";

type SaveStatus = "idle" | "saving" | "saved" | "error";

async function resolveWikilinkRequest(text: string): Promise<string | null> {
  const res = await fetch(
    `/api/wikilink/resolve?text=${encodeURIComponent(text)}`,
  );
  if (!res.ok) return null;
  const body = (await res.json()) as { id: string | null };
  return body.id;
}

async function suggestWikilinkRequest(
  q: string,
): Promise<WikilinkSuggestion[]> {
  const res = await fetch(
    `/api/wikilink/suggest?q=${encodeURIComponent(q)}`,
  );
  if (!res.ok) return [];
  const body = (await res.json()) as { suggestions: WikilinkSuggestion[] };
  return body.suggestions;
}

export function Workspace() {
  const [activeId, setActiveId] = useNoteRoute();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [captureOpen, setCaptureOpen] = useState(false);

  const { data: activeNote } = useGetNoteQuery(activeId ?? "", {
    skip: !activeId,
  });
  const [createNote] = useCreateNoteMutation();
  const [saveNote] = useSaveNoteMutation();

  const onCreate = useCallback(async () => {
    const note = await createNote({}).unwrap();
    setActiveId(note.id);
  }, [createNote, setActiveId]);

  // Global hotkeys: ⌘J = new Note, ⌘⇧J = Capture, ⌘[ / ⌘] = history nav.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === "j") {
        event.preventDefault();
        if (event.shiftKey) setCaptureOpen(true);
        else void onCreate();
      } else if (event.key === "[") {
        event.preventDefault();
        window.history.back();
      } else if (event.key === "]") {
        event.preventDefault();
        window.history.forward();
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

  // Wikilink: clicking a resolved link navigates; clicking an unresolved
  // link offers to create a new Note pre-populated with the title as H1.
  const handleWikilinkClick = useCallback(
    async (linkText: string) => {
      const id = await resolveWikilinkRequest(linkText);
      if (id) {
        setActiveId(id);
        return;
      }
      if (!window.confirm(`Create new note "${linkText}"?`)) return;
      const note = await createNote({}).unwrap();
      await saveNote({ id: note.id, body: `# ${linkText}\n\n` }).unwrap();
      setActiveId(note.id);
    },
    [createNote, saveNote, setActiveId],
  );

  const wikilinkHandlers = useMemo(
    () => ({
      resolve: async (text: string) => (await resolveWikilinkRequest(text)) !== null,
      onClick: (text: string) => void handleWikilinkClick(text),
    }),
    [handleWikilinkClick],
  );

  return (
    <div style={{ display: "flex", gap: "1rem", padding: "1rem 1.5rem" }}>
      <CaptureModal open={captureOpen} onClose={() => setCaptureOpen(false)} />

      <aside style={{ flex: "0 0 14rem" }}>
        <button
          onClick={onCreate}
          style={{ width: "100%", padding: "0.5rem", marginBottom: "0.5rem" }}
        >
          + New Note (⌘J)
        </button>
        <button
          onClick={() => setCaptureOpen(true)}
          style={{ width: "100%", padding: "0.5rem", marginBottom: "0.75rem" }}
        >
          ⚡ Capture (⌘⇧J)
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
              wikilink={wikilinkHandlers}
              suggestWikilinks={suggestWikilinkRequest}
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
            Pick a Note from the sidebar, or press <kbd>⌘J</kbd> to create one.
            <br />
            Use <kbd>⌘[</kbd> / <kbd>⌘]</kbd> to navigate back/forward.
          </p>
        )}
      </section>
    </div>
  );
}
