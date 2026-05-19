// CodeMirror autocomplete source for [[wikilinks]]. Fires when the cursor
// sits inside a `[[ ... ` opening that hasn't been closed yet, queries the
// server for tier-ranked matches, and presents them as completions. Enter
// inserts `<title>]]` and parks the cursor after the closing brackets so
// typing flows naturally.

import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import type { WikilinkSuggestion } from "@shared/types";

export interface WikilinkSuggestSource {
  (query: string): Promise<WikilinkSuggestion[]>;
}

// Matches `[[<query>` where <query> is anything except `]` (so we stop at a
// closed link). Cursor must sit at the end of <query>.
const OPEN_RE = /\[\[([^\]\n]*)$/;

// Pure math for the edit applied when the user picks a suggestion. Extracted
// so it can be tested without spinning up an EditorView. `from` is the
// position right after the opening `[[`, `to` is the cursor, `charsAfter` is
// the two chars immediately following the cursor — we consume `]]` there
// instead of inserting another pair (otherwise `[[an]]` → `[[an]]]]`).
export interface WikilinkEdit {
  from: number;
  to: number;
  insert: string;
  cursorAt: number;
}

export function buildWikilinkEdit(
  from: number,
  to: number,
  charsAfter: string,
  title: string,
): WikilinkEdit {
  const consumesClosing = charsAfter === "]]";
  return {
    from,
    to: consumesClosing ? to + 2 : to,
    insert: `${title}]]`,
    cursorAt: from + title.length + 2,
  };
}

export function wikilinkAutocomplete(suggest: WikilinkSuggestSource) {
  return autocompletion({
    override: [
      async (ctx: CompletionContext): Promise<CompletionResult | null> => {
        const before = ctx.matchBefore(OPEN_RE);
        if (!before) return null;
        // before.text looks like "[[some prefix"; strip the opening braces.
        const query = before.text.slice(2);
        // Without a query, only show on explicit invocation (Ctrl+Space).
        if (!query && !ctx.explicit) return null;

        const suggestions = await suggest(query);

        const options: Completion[] = suggestions.map((s) => ({
          label: s.title,
          detail: new Date(s.modified).toLocaleDateString(),
          boost: s.tier === 1 ? 10 : 0,
          apply: (view, _completion, from, to) => {
            const charsAfter = view.state.sliceDoc(to, to + 2);
            const edit = buildWikilinkEdit(from, to, charsAfter, s.title);
            view.dispatch({
              changes: { from: edit.from, to: edit.to, insert: edit.insert },
              selection: { anchor: edit.cursorAt },
            });
          },
        }));

        return {
          from: before.from + 2,
          to: ctx.pos,
          options,
          // Tell CodeMirror the autocomplete is still active even with no
          // matches, so the dropdown shows "no suggestions" instead of
          // bouncing closed on every keystroke that doesn't hit.
          filter: false,
        };
      },
    ],
  });
}
