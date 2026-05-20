// Three-pane workspace shown once a Vault is configured: notes/daily sidebar
// on the left, CodeMirror editor in the centre, backlinks rail on the right
// (the rail collapses below `xl` and rides under the editor for narrow
// screens). Owns global hotkeys and orchestrates wikilink resolution /
// creation. The editor section branches on the current URL route — a `note`
// route shows the Note editor, a `daily` route shows the Daily Note editor.
//
// The "which doc is open" state lives in the URL hash (see useRoute), so
// browser back/forward — and our ⌘[ / ⌘] bindings — work for free.
//
// Why ⌘J for "new Note" instead of the obvious ⌘N: browsers hard-reserve ⌘N
// (new window) and ⌘⇧N (new incognito) at the system level, so preventDefault
// is a no-op. ⌘J is free across the major browsers.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import {
  BoltIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import {
  clearBuffer,
  setBuffer,
  setSaveStatus,
} from "./editorStatusSlice";
import type { RenamePlanSummary, WikilinkSuggestion } from "@shared/types";
import { NoteEditor } from "./NoteEditor";
import { NotesSidebar } from "./NotesSidebar";
import { DailySidebar } from "./DailySidebar";
import { CaptureModal } from "./CaptureModal";
import { CommandPalette } from "./CommandPalette";
import { BacklinksPanel } from "./BacklinksPanel";
import { RenameConfirmModal } from "./RenameConfirmModal";
import {
  notesApi,
  useCreateNoteMutation,
  useGetNoteQuery,
  useSaveNoteMutation,
} from "./notesApi";
import {
  dailyApi,
  useGetDailyNoteQuery,
  useSaveDailyNoteMutation,
} from "./dailyApi";
import { debounce } from "./debounce";
import { useRoute } from "./useNoteRoute";
import { connectToVaultEvents } from "./eventsClient";
import { decideExternalReloadAction } from "./externalReload";
import { findBlockLine } from "./dailyBlockLine";
import type { Route } from "./route";
import type { AppDispatch } from "./store";

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
  const res = await fetch(`/api/wikilink/suggest?q=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  const body = (await res.json()) as { suggestions: WikilinkSuggestion[] };
  return body.suggestions;
}

export function Workspace() {
  const dispatch = useDispatch<AppDispatch>();
  const [route, setRoute] = useRoute();
  const activeNoteId = route.kind === "note" ? route.noteId : null;
  const activeDailyDate = route.kind === "daily" ? route.date : null;
  const activeBlockIndex = route.kind === "daily" ? route.blockIndex : null;

  const [captureOpen, setCaptureOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [editorReloadToken, setEditorReloadToken] = useState(0);
  // Rename confirmation state. When a debounced save returns 409 the modal
  // opens against the latest plan; we also stash the body that produced it
  // so confirming sends the exact bytes the user authored.
  const [renamePlan, setRenamePlan] = useState<RenamePlanSummary | null>(null);
  const [renamePending, setRenamePending] = useState(false);
  const pendingRenameBodyRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const routeRef = useRef(route);
  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  // currentData (vs. data) goes undefined immediately when the query arg
  // changes — necessary so we don't briefly mount the editor with the
  // previous doc's body when the user navigates between Notes / Dailies.
  const { currentData: activeNote } = useGetNoteQuery(activeNoteId ?? "", {
    skip: !activeNoteId,
  });
  const { currentData: activeDaily, error: dailyError } = useGetDailyNoteQuery(
    activeDailyDate ?? "",
    { skip: !activeDailyDate },
  );

  const [createNote] = useCreateNoteMutation();
  const [saveNote] = useSaveNoteMutation();
  const [saveDaily] = useSaveDailyNoteMutation();

  const openNote = useCallback(
    (id: string | null) => {
      setRoute(id ? { kind: "note", noteId: id } : { kind: "none" });
    },
    [setRoute],
  );

  const openDaily = useCallback(
    (date: string, blockIndex: number | null = null) => {
      setRoute({ kind: "daily", date, blockIndex });
    },
    [setRoute],
  );

  const onCreate = useCallback(async () => {
    const note = await createNote({}).unwrap();
    openNote(note.id);
  }, [createNote, openNote]);

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

  // Two debounced savers, one per editor kind — they share semantics but
  // target different endpoints, so keeping them separate is simpler than a
  // discriminated saver function.
  const debouncedSaveNote = useMemo(
    () =>
      debounce((id: string, body: string) => {
        dispatch(setSaveStatus("saving"));
        saveNote({ id, body })
          .unwrap()
          .then(() => dispatch(setSaveStatus("saved")))
          .catch((err: { status?: number; data?: unknown }) => {
            // 409 with RENAME_NEEDS_CONFIRM isn't a save failure — it's the
            // server asking us to surface a confirmation modal. Stash the
            // plan + the body that produced it, then revert save status so
            // the StatusBar shows idle until the user decides.
            const data = err?.data as
              | { error?: string; plan?: RenamePlanSummary }
              | undefined;
            if (
              err?.status === 409 &&
              data?.error === "RENAME_NEEDS_CONFIRM" &&
              data.plan
            ) {
              pendingRenameBodyRef.current = body;
              setRenamePlan(data.plan);
              dispatch(setSaveStatus("idle"));
              return;
            }
            dispatch(setSaveStatus("error"));
          });
      }, 500),
    [saveNote, dispatch],
  );

  const debouncedSaveDaily = useMemo(
    () =>
      debounce((date: string, body: string) => {
        dispatch(setSaveStatus("saving"));
        saveDaily({ date, body })
          .unwrap()
          .then(() => {
            dispatch(setSaveStatus("saved"));
            // A Daily Note edit can rewrite wikilinks in any of its Blocks,
            // which may flip backlinks for arbitrary Notes.
            dispatch(notesApi.util.invalidateTags(["Backlinks"]));
          })
          .catch(() => dispatch(setSaveStatus("error")));
      }, 500),
    [saveDaily, dispatch],
  );

  useEffect(() => {
    const onBeforeUnload = () => {
      debouncedSaveNote.flush();
      debouncedSaveDaily.flush();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      debouncedSaveNote.cancel();
      debouncedSaveDaily.cancel();
    };
  }, [debouncedSaveNote, debouncedSaveDaily]);

  const handleNoteEditorChange = useCallback(
    (body: string) => {
      if (!activeNoteId) return;
      dirtyRef.current = true;
      dispatch(setBuffer(body));
      dispatch(setSaveStatus("idle"));
      debouncedSaveNote(activeNoteId, body);
    },
    [activeNoteId, debouncedSaveNote, dispatch],
  );

  const handleDailyEditorChange = useCallback(
    (body: string) => {
      if (!activeDailyDate) return;
      dirtyRef.current = true;
      dispatch(setBuffer(body));
      dispatch(setSaveStatus("idle"));
      debouncedSaveDaily(activeDailyDate, body);
    },
    [activeDailyDate, debouncedSaveDaily, dispatch],
  );

  // Reset the StatusBar's word-count buffer when the open doc changes; the
  // StatusBar falls back to the freshly-fetched body until the user types.
  useEffect(() => {
    dispatch(clearBuffer());
  }, [activeNoteId, activeDailyDate, dispatch]);

  const reloadActive = useCallback(async () => {
    const r = routeRef.current;
    if (r.kind === "note") {
      await dispatch(
        notesApi.endpoints.getNote.initiate(r.noteId, { forceRefetch: true }),
      ).unwrap();
      dispatch(notesApi.util.invalidateTags(["Notes", "Backlinks"]));
    } else if (r.kind === "daily") {
      await dispatch(
        dailyApi.endpoints.getDailyNote.initiate(r.date, {
          forceRefetch: true,
        }),
      ).unwrap();
      dispatch(dailyApi.util.invalidateTags(["DailyList"]));
    }
    dirtyRef.current = false;
    setEditorReloadToken((n) => n + 1);
  }, [dispatch]);

  useEffect(() => {
    const conn = connectToVaultEvents((event) => {
      const r = routeRef.current;
      const action = decideExternalReloadAction(event, {
        activeNoteId: r.kind === "note" ? r.noteId : null,
        activeDailyDate: r.kind === "daily" ? r.date : null,
        dirty: dirtyRef.current,
      });
      if (action.kind === "refresh-list") {
        if (event.kind === "note") {
          dispatch(notesApi.util.invalidateTags(["Notes", "Backlinks"]));
        } else {
          dispatch(dailyApi.util.invalidateTags(["DailyList"]));
          dispatch(notesApi.util.invalidateTags(["Backlinks"]));
        }
        return;
      }
      if (action.kind === "reload-active") {
        void reloadActive();
        return;
      }
      if (action.kind === "prompt-conflict") {
        const reload = window.confirm(
          "This was changed outside Bloom. Reload and discard your unsaved edits?",
        );
        if (reload) void reloadActive();
        return;
      }
      if (action.kind === "prompt-deleted") {
        window.alert("This was deleted outside Bloom.");
        setRoute({ kind: "none" });
        dispatch(notesApi.util.invalidateTags(["Notes", "Backlinks"]));
        dispatch(dailyApi.util.invalidateTags(["DailyList"]));
      }
    });
    return () => conn.close();
  }, [dispatch, reloadActive, setRoute]);

  // Whenever a fresh active body lands from the server, the buffer is in sync
  // with disk again.
  useEffect(() => {
    if (activeNote || activeDaily) dirtyRef.current = false;
  }, [activeNote, activeDaily]);

  // Block deep-links: derive the line of the requested Block heading from the
  // current Daily body. Recomputed whenever the body or the index changes, so
  // an edit-then-revisit pattern still lands on the right line.
  const scrollToLine = useMemo(() => {
    if (route.kind !== "daily" || route.blockIndex == null) return null;
    if (!activeDaily) return null;
    return findBlockLine(activeDaily.body, route.blockIndex);
  }, [route, activeDaily]);

  const confirmRename = useCallback(async () => {
    const id = activeNoteId;
    const body = pendingRenameBodyRef.current;
    if (!id || body == null) {
      setRenamePlan(null);
      return;
    }
    setRenamePending(true);
    dispatch(setSaveStatus("saving"));
    try {
      await saveNote({ id, body, renameConfirmed: true }).unwrap();
      dispatch(setSaveStatus("saved"));
      pendingRenameBodyRef.current = null;
      setRenamePlan(null);
    } catch {
      dispatch(setSaveStatus("error"));
    } finally {
      setRenamePending(false);
    }
  }, [activeNoteId, dispatch, saveNote]);

  const cancelRename = useCallback(() => {
    pendingRenameBodyRef.current = null;
    setRenamePlan(null);
    // The buffer keeps the user's new title; the StatusBar shows idle. They
    // can keep typing — the next debounced save will re-prompt.
  }, []);

  const handleWikilinkClick = useCallback(
    async (linkText: string) => {
      const id = await resolveWikilinkRequest(linkText);
      if (id) {
        openNote(id);
        return;
      }
      if (!window.confirm(`Create new note "${linkText}"?`)) return;
      const note = await createNote({}).unwrap();
      await saveNote({ id: note.id, body: `# ${linkText}\n\n` }).unwrap();
      openNote(note.id);
    },
    [createNote, saveNote, openNote],
  );

  const wikilinkHandlers = useMemo(
    () => ({
      resolve: async (text: string) =>
        (await resolveWikilinkRequest(text)) !== null,
      onClick: (text: string) => void handleWikilinkClick(text),
    }),
    [handleWikilinkClick],
  );

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[16rem_1fr] xl:grid-cols-[16rem_1fr_18rem]">
      <CaptureModal open={captureOpen} onClose={() => setCaptureOpen(false)} />
      <RenameConfirmModal
        plan={renamePlan}
        busy={renamePending}
        onConfirm={() => void confirmRename()}
        onCancel={cancelRename}
      />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpenNote={openNote}
        onOpenBlock={openDaily}
      />

      <aside className="flex min-h-0 flex-col gap-5 overflow-y-auto border-r border-neutral-950/5 px-4 py-5">
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={onCreate}
            className="flex items-center justify-between rounded-md bg-accent-700 px-3 py-2 text-sm font-medium text-white ring-1 ring-accent-700 hover:bg-accent-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600"
          >
            <span className="flex items-center gap-2">
              <PlusIcon aria-hidden="true" className="size-4" />
              New Note
            </span>
            <kbd className="font-mono text-xs text-white/70">⌘J</kbd>
          </button>
          <button
            type="button"
            onClick={() => setCaptureOpen(true)}
            className="flex items-center justify-between rounded-md bg-white px-3 py-2 text-sm font-medium text-neutral-700 ring-1 ring-neutral-950/10 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600"
          >
            <span className="flex items-center gap-2">
              <BoltIcon aria-hidden="true" className="size-4 text-accent-700" />
              Capture
            </span>
            <kbd className="font-mono text-xs text-neutral-400">⌘⇧J</kbd>
          </button>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600"
          >
            <span className="flex items-center gap-2">
              <MagnifyingGlassIcon
                aria-hidden="true"
                className="size-4 text-neutral-400"
              />
              Search
            </span>
            <kbd className="font-mono text-xs text-neutral-400">⌘K</kbd>
          </button>
        </div>

        <DailySidebar activeDate={activeDailyDate} onOpenDaily={openDaily} />
        <NotesSidebar activeId={activeNoteId} onOpen={openNote} />
      </aside>

      <section className="flex min-h-0 flex-col overflow-y-auto">
        {route.kind === "note" && activeNote && (
          <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10">
            <NoteEditor
              key={`note:${activeNote.id}:${editorReloadToken}`}
              noteId={activeNote.id}
              initialBody={activeNote.body}
              onChange={handleNoteEditorChange}
              wikilink={wikilinkHandlers}
              suggestWikilinks={suggestWikilinkRequest}
            />
            <div className="mt-10 xl:hidden">
              <BacklinksPanel
                noteId={activeNote.id}
                onOpenNote={openNote}
                onOpenBlock={openDaily}
              />
            </div>
          </div>
        )}

        {route.kind === "daily" && (
          <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10">
            <header className="mb-4 flex items-baseline justify-between border-b border-neutral-950/5 pb-3">
              <h1 className="text-lg font-semibold tracking-tight text-neutral-900">
                Daily Note
              </h1>
              <span className="font-mono text-sm text-neutral-500 tabular-nums">
                {route.date}
              </span>
            </header>
            {activeDaily ? (
              <>
                <NoteEditor
                  key={`daily:${route.date}:${editorReloadToken}`}
                  noteId={`daily:${route.date}`}
                  initialBody={activeDaily.body}
                  onChange={handleDailyEditorChange}
                  wikilink={wikilinkHandlers}
                  suggestWikilinks={suggestWikilinkRequest}
                  scrollToLine={scrollToLine}
                />
              </>
            ) : dailyError ? (
              <DailyEmptyState date={route.date} />
            ) : (
              <p className="text-sm text-neutral-400">Loading…</p>
            )}
          </div>
        )}

        {route.kind === "none" && (
          <div className="mx-auto flex w-full max-w-md flex-col items-start gap-4 px-6 py-24 text-neutral-500">
            <p className="font-mono text-xs tracking-wide text-accent-700 uppercase">
              No Note selected
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">
              Start with a fresh page.
            </h2>
            <p className="text-pretty">
              Pick a Note from the sidebar, or press{" "}
              <kbd className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-700">
                ⌘J
              </kbd>{" "}
              to create one. Search everything with{" "}
              <kbd className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-700">
                ⌘K
              </kbd>
              .
            </p>
          </div>
        )}
      </section>

      <aside className="hidden min-h-0 overflow-y-auto border-l border-neutral-950/5 px-5 py-6 xl:block">
        {route.kind === "note" && activeNote ? (
          <BacklinksPanel
            noteId={activeNote.id}
            onOpenNote={openNote}
            onOpenBlock={openDaily}
          />
        ) : (
          <p className="font-mono text-xs tracking-wide text-neutral-400 uppercase">
            Backlinks
          </p>
        )}
      </aside>
    </div>
  );
}

function DailyEmptyState({ date }: { date: string }) {
  return (
    <div className="mt-4 rounded-md bg-neutral-50 px-4 py-6 text-sm text-neutral-500">
      No Daily Note for{" "}
      <span className="font-mono tabular-nums text-neutral-700">{date}</span>{" "}
      yet. Press{" "}
      <kbd className="rounded bg-white px-1.5 py-0.5 font-mono text-xs text-neutral-700 ring-1 ring-neutral-950/10">
        ⌘⇧J
      </kbd>{" "}
      to Capture a Block — that creates the file.
    </div>
  );
}
