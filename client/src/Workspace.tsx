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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import type { WikilinkSuggestion } from "@shared/types";
import { NoteEditor } from "./NoteEditor";
import { NotesSidebar } from "./NotesSidebar";
import { CaptureModal } from "./CaptureModal";
import { CommandPalette } from "./CommandPalette";
import { BacklinksPanel } from "./BacklinksPanel";
import {
  notesApi,
  useCreateNoteMutation,
  useGetNoteQuery,
  useSaveNoteMutation,
} from "./notesApi";
import { debounce } from "./debounce";
import { useNoteRoute } from "./useNoteRoute";
import { connectToVaultEvents } from "./eventsClient";
import { decideExternalReloadAction } from "./externalReload";
import type { AppDispatch } from "./store";

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
  const dispatch = useDispatch<AppDispatch>();
  const [activeId, setActiveId] = useNoteRoute();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [captureOpen, setCaptureOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Bumped every time we want the CodeMirror editor to re-hydrate from
  // activeNote.body — used when an external edit lands and we need to throw
  // away the in-memory buffer (the editor mounts once per noteId, so a key
  // bump is how we tell React to remount it with the fresh content).
  const [editorReloadToken, setEditorReloadToken] = useState(0);
  // Tracks whether the open editor's buffer has unsaved keystrokes ahead of
  // the debounced save. Used by the external-change handler below.
  const dirtyRef = useRef(false);
  const activeIdRef = useRef(activeId);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const { data: activeNote } = useGetNoteQuery(activeId ?? "", {
    skip: !activeId,
  });
  const [createNote] = useCreateNoteMutation();
  const [saveNote] = useSaveNoteMutation();

  const onCreate = useCallback(async () => {
    const note = await createNote({}).unwrap();
    setActiveId(note.id);
  }, [createNote, setActiveId]);

  // Global hotkeys: ⌘J = new Note, ⌘⇧J = Capture, ⌘K = command palette,
  // ⌘[ / ⌘] = history nav.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === "j") {
        event.preventDefault();
        if (event.shiftKey) setCaptureOpen(true);
        else void onCreate();
      } else if (key === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
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
      dirtyRef.current = true;
      setSaveStatus("idle");
      debouncedSave(activeId, body);
    },
    [activeId, debouncedSave],
  );

  // Refetch the active Note and then remount the CodeMirror editor so the
  // user sees the fresh body. The forceRefetch awaits the network round-trip,
  // and bumping the reload token after it resolves guarantees React renders
  // the editor with the new activeNote.body (the editor reads initialBody
  // only on mount, so without the bump the doc would not change).
  const reloadActiveNote = useCallback(
    async (id: string) => {
      await dispatch(
        notesApi.endpoints.getNote.initiate(id, { forceRefetch: true }),
      ).unwrap();
      dispatch(notesApi.util.invalidateTags(["Notes", "Backlinks"]));
      dirtyRef.current = false;
      setEditorReloadToken((n) => n + 1);
    },
    [dispatch],
  );

  // Subscribe to the watcher's SSE feed once, for the life of the Workspace.
  // The dispatched RTK Query invalidations refetch the affected slices via
  // their existing tag wiring (no extra API plumbing required).
  useEffect(() => {
    const conn = connectToVaultEvents((event) => {
      const action = decideExternalReloadAction(event, {
        activeNoteId: activeIdRef.current,
        dirty: dirtyRef.current,
      });
      if (action.kind === "refresh-list") {
        dispatch(notesApi.util.invalidateTags(["Notes", "Backlinks"]));
        return;
      }
      if (action.kind === "reload-active" && activeIdRef.current) {
        void reloadActiveNote(activeIdRef.current);
        return;
      }
      if (action.kind === "prompt-conflict" && activeIdRef.current) {
        const id = activeIdRef.current;
        const reload = window.confirm(
          "This Note was changed outside Bloom. Reload and discard your unsaved edits?",
        );
        if (reload) {
          void reloadActiveNote(id);
        }
        return;
      }
      if (action.kind === "prompt-deleted") {
        window.alert("This Note was deleted outside Bloom.");
        setActiveId(null);
        dispatch(notesApi.util.invalidateTags(["Notes", "Backlinks"]));
      }
    });
    return () => conn.close();
  }, [dispatch, reloadActiveNote, setActiveId]);

  // Whenever a fresh activeNote.body lands from the server (initial fetch or
  // after a reload-active), the buffer is in sync with disk again.
  useEffect(() => {
    if (activeNote) dirtyRef.current = false;
  }, [activeNote]);

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
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpenNote={setActiveId}
      />

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
              key={`${activeNote.id}:${editorReloadToken}`}
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
            <BacklinksPanel noteId={activeNote.id} onOpenNote={setActiveId} />
          </>
        ) : (
          <p style={{ color: "#888" }}>
            Pick a Note from the sidebar, or press <kbd>⌘J</kbd> to create one.
            <br />
            Search everything with <kbd>⌘K</kbd>. Navigate history with{" "}
            <kbd>⌘[</kbd> / <kbd>⌘]</kbd>.
          </p>
        )}
      </section>
    </div>
  );
}
