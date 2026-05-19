// CodeMirror 6 extension that renders [[wikilinks]] with distinct styling
// and click handling.
//
// Resolution is async: as the visible doc reveals new link texts, we fire a
// resolve request and store the result in a StateField. The decoration view
// plugin reads from that field and re-styles when it changes, so a link
// transitions pending → resolved/unresolved without the user touching the
// editor. Each link text is resolved at most once per editor lifetime.

import { StateEffect, StateField, RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

const WIKILINK_REGEX = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;

type Resolution = "resolved" | "unresolved";

// State carriers ----------------------------------------------------------

const setResolution = StateEffect.define<{
  linkText: string;
  resolution: Resolution;
}>();

const resolutionField = StateField.define<Map<string, Resolution>>({
  create: () => new Map(),
  update(value, tr) {
    let next = value;
    let mutated = false;
    for (const effect of tr.effects) {
      if (effect.is(setResolution)) {
        if (!mutated) {
          next = new Map(next);
          mutated = true;
        }
        next.set(effect.value.linkText, effect.value.resolution);
      }
    }
    return mutated ? next : value;
  },
});

// Decorations -------------------------------------------------------------

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const resolutions = view.state.field(resolutionField);
  const doc = view.state.doc.toString();
  for (const match of doc.matchAll(WIKILINK_REGEX)) {
    const linkText = match[1]!.trim();
    const from = match.index!;
    const to = from + match[0].length;
    const status = resolutions.get(linkText) ?? "pending";
    builder.add(
      from,
      to,
      Decoration.mark({
        class: `cm-wikilink cm-wikilink-${status}`,
        attributes: { "data-wikilink": linkText },
      }),
    );
  }
  return builder.finish();
}

// Plugin ------------------------------------------------------------------

export interface WikilinkHandlers {
  resolve: (linkText: string) => Promise<boolean>;
  onClick: (linkText: string) => void;
}

function wikilinkPlugin(handlers: WikilinkHandlers) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      pending = new Set<string>();

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
        this.requestResolutions(view);
      }

      update(update: ViewUpdate) {
        const fieldChanged =
          update.state.field(resolutionField) !==
          update.startState.field(resolutionField);
        if (update.docChanged || update.viewportChanged || fieldChanged) {
          this.decorations = buildDecorations(update.view);
          this.requestResolutions(update.view);
        }
      }

      requestResolutions(view: EditorView) {
        const known = view.state.field(resolutionField);
        const doc = view.state.doc.toString();
        for (const match of doc.matchAll(WIKILINK_REGEX)) {
          const linkText = match[1]!.trim();
          if (known.has(linkText) || this.pending.has(linkText)) continue;
          this.pending.add(linkText);
          handlers
            .resolve(linkText)
            .then((found) => {
              this.pending.delete(linkText);
              view.dispatch({
                effects: setResolution.of({
                  linkText,
                  resolution: found ? "resolved" : "unresolved",
                }),
              });
            })
            .catch(() => {
              this.pending.delete(linkText);
            });
        }
      }
    },
    {
      decorations: (v) => v.decorations,
      eventHandlers: {
        click(event, view) {
          const target = event.target as HTMLElement | null;
          const span = target?.closest<HTMLElement>("[data-wikilink]");
          if (!span) return false;
          event.preventDefault();
          const linkText = span.getAttribute("data-wikilink");
          if (linkText) handlers.onClick(linkText);
          return true;
        },
      },
    },
  );
}

// Theme -------------------------------------------------------------------

const wikilinkTheme = EditorView.baseTheme({
  ".cm-wikilink": {
    cursor: "pointer",
    textDecoration: "underline",
    textUnderlineOffset: "2px",
  },
  ".cm-wikilink-resolved": {
    color: "#4f46e5",
    textDecorationColor: "#a5b4fc",
  },
  ".cm-wikilink-unresolved": {
    color: "#b91c1c",
    textDecorationStyle: "dashed",
  },
  ".cm-wikilink-pending": {
    color: "#6b7280",
  },
});

// Public extension --------------------------------------------------------

export function wikilinkExtension(handlers: WikilinkHandlers) {
  return [resolutionField, wikilinkPlugin(handlers), wikilinkTheme];
}
