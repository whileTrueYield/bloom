// CodeMirror 6 mounted directly, no React wrapper (per ADR 0010). The editor
// holds its own in-progress state; the parent only hears about changes via
// onChange. The editor is re-created when noteId changes (so loading a
// different Note hydrates the doc); onChange is captured by ref so the parent
// can swap callbacks without remounting the editor.

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
}

export function NoteEditor({
  noteId,
  initialBody,
  onChange,
  wikilink,
  suggestWikilinks,
}: NoteEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
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

    return () => view.destroy();
    // initialBody intentionally excluded — it only matters at construction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  return <div ref={containerRef} style={{ height: "100%", minHeight: "20rem" }} />;
}
