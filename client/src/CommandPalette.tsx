// ⌘K command palette / global search. Renders an overlay near the top of the
// viewport with a search input. Results stream in live as the user types
// (debounced ~150ms via local state), visually distinguish Note vs Block
// hits, and click-to-navigate to either a Note or a Block within a Daily
// Note (the block route includes the index so the editor scrolls into view).

import { useEffect, useRef, useState } from "react";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import type { SearchResult } from "@shared/types";
import { useSearchQuery } from "./searchApi";

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onOpenNote: (id: string) => void;
  onOpenBlock: (date: string, blockIndex: number) => void;
}

export function CommandPalette({
  open,
  onClose,
  onOpenNote,
  onOpenBlock,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setDebouncedQuery("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const { data, isFetching } = useSearchQuery(debouncedQuery, {
    skip: !open || !debouncedQuery,
  });

  if (!open) return null;

  const results = data?.results ?? [];

  const handleClick = (hit: SearchResult) => {
    if (hit.kind === "note") {
      onOpenNote(hit.noteId);
    } else {
      onOpenBlock(hit.dailyDate, hit.blockIndex);
    }
    onClose();
  };

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      className="fixed inset-0 z-100 flex items-start justify-center bg-neutral-950/40 px-4 pt-[10vh] backdrop-blur-sm"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/5"
      >
        <div className="flex items-center gap-3 border-b border-neutral-950/5 px-4">
          <MagnifyingGlassIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-neutral-400"
          />
          <input
            ref={inputRef}
            type="search"
            name="search"
            aria-label="Search Notes and captured Blocks"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Notes and captured Blocks…"
            className="block w-full appearance-none bg-transparent py-3.5 text-base text-neutral-900 outline-none placeholder:text-neutral-400 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden max-sm:text-base/6"
          />
          <kbd className="hidden font-mono text-xs text-neutral-400 sm:block">
            esc
          </kbd>
        </div>

        <ul
          role="list"
          className="max-h-[60vh] overflow-y-auto py-1.5"
          aria-busy={isFetching}
        >
          {results.length === 0 && debouncedQuery && !isFetching && (
            <li className="px-4 py-6 text-center text-sm text-neutral-400">
              No matches.
            </li>
          )}
          {!debouncedQuery && (
            <li className="px-4 py-6 text-center text-sm text-neutral-400">
              Start typing to search.
            </li>
          )}
          {results.map((hit, i) => (
            <li key={`${hit.kind}-${i}`}>
              <button
                type="button"
                onClick={() => handleClick(hit)}
                className="flex w-full cursor-pointer items-start gap-3 px-4 py-2.5 text-left hover:bg-neutral-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-600"
              >
                <span
                  aria-hidden="true"
                  className={
                    "mt-1 font-mono text-xs tracking-wide uppercase " +
                    (hit.kind === "note"
                      ? "text-accent-700"
                      : "text-amber-700")
                  }
                >
                  {hit.kind === "note" ? "Note" : "Block"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-neutral-900">
                    {hit.kind === "note"
                      ? (hit.title ?? "(untitled)")
                      : `${hit.dailyDate}${hit.time ? ` · ${hit.time}` : ""}`}
                  </div>
                  <div className="truncate text-sm text-neutral-500">
                    {hit.snippet}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
