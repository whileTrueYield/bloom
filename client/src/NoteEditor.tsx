// CodeMirror 6 mounted directly, no React wrapper (per ADR 0010). The editor
// holds its own in-progress state; the parent only hears about changes via
// onChange. The editor is re-created when noteId changes (so loading a
// different doc hydrates it); onChange is captured by ref so the parent
// can swap callbacks without remounting.
//
// Used by both Notes and Daily Notes — both are markdown with wikilinks, so
// one component covers both surfaces. The `scrollToLine` prop is how Daily
// Note deep-links land on a specific Block heading.

import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { wikilinkExtension, type WikilinkHandlers } from "./wikilinkExtension";
import {
  wikilinkAutocomplete,
  type WikilinkSuggestSource,
} from "./wikilinkAutocomplete";

export interface NoteEditorProps {
  noteId: string;
  initialBody: string;
  onChange: (body: string) => void;
  wikilink?: WikilinkHandlers;
  suggestWikilinks?: WikilinkSuggestSource;
  // 0-based line number to scroll into view once the editor is ready. Used by
  // the Daily Note Block deep-link flow. Changing this prop on a mounted
  // editor re-scrolls — it does not remount.
  scrollToLine?: number | null;
}

export function NoteEditor({
  noteId,
  initialBody,
  onChange,
  wikilink,
  suggestWikilinks,
  scrollToLine,
}: NoteEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const wikilinkRef = useRef(wikilink);
  const suggestRef = useRef(suggestWikilinks);

  // Keep the latest callbacks reachable from inside the editor extension
  // without forcing the editor to re-mount when the parent rerenders.
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    wikilinkRef.current = wikilink;
  }, [wikilink]);
  useEffect(() => {
    suggestRef.current = suggestWikilinks;
  }, [suggestWikilinks]);

  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: initialBody,
        extensions: [
          basicSetup,
          markdown(),
          wikilinkExtension({
            resolve: (text) =>
              wikilinkRef.current?.resolve(text) ?? Promise.resolve(false),
            onClick: (text) => wikilinkRef.current?.onClick(text),
          }),
          wikilinkAutocomplete((q) =>
            suggestRef.current?.(q) ?? Promise.resolve([]),
          ),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
        ],
      }),
      parent: containerRef.current,
    });
    viewRef.current = view;

    return () => {
      viewRef.current = null;
      view.destroy();
    };
    // initialBody intentionally excluded — it only matters at construction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  // Scroll the deep-linked Block heading into view. Runs on mount (via the
  // dep on scrollToLine and noteId) and again whenever the target line
  // changes — clicking a different Block hit in the palette retargets.
  useEffect(() => {
    if (scrollToLine == null) return;
    const view = viewRef.current;
    if (!view) return;
    // The doc is 1-indexed by CodeMirror; our caller speaks 0-based lines.
    const lineNumber = Math.min(scrollToLine + 1, view.state.doc.lines);
    const line = view.state.doc.line(lineNumber);
    view.dispatch({
      effects: EditorView.scrollIntoView(line.from, { y: "start" }),
      selection: { anchor: line.from },
    });
  }, [scrollToLine, noteId]);

  return (
    <div ref={containerRef} className="min-h-[20rem] flex-1 text-neutral-900" />
  );
}
