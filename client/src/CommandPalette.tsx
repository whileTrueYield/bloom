// Cmd+K command palette / global search. Renders an overlay at the top of
// the viewport with a search input. Results stream in live as the user types
// (debounced ~150ms via local state), visually distinguish Note vs Block
// hits, and click-to-navigate for Notes. Block navigation lands in slice
// #12 (Daily Notes view); for now block results just expand their snippet
// inline.

import { useEffect, useRef, useState } from "react";
import type { SearchResult } from "@shared/types";
import { useSearchQuery } from "./searchApi";

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onOpenNote: (id: string) => void;
}

export function CommandPalette({ open, onClose, onOpenNote }: CommandPaletteProps) {
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
      onClose();
    }
    // Block navigation lands in slice #12 — no-op here.
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.25)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "10vh",
        zIndex: 100,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(40rem, 90vw)",
          background: "white",
          borderRadius: "0.5rem",
          boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
          fontFamily: "system-ui, sans-serif",
          overflow: "hidden",
        }}
      >
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Notes and captured Blocks…"
          style={{
            width: "100%",
            padding: "0.75rem 1rem",
            border: "none",
            borderBottom: "1px solid #e5e5e5",
            fontSize: "1rem",
            outline: "none",
            boxSizing: "border-box",
          }}
        />

        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            maxHeight: "60vh",
            overflowY: "auto",
          }}
        >
          {results.length === 0 && debouncedQuery && !isFetching && (
            <li style={{ padding: "1rem", color: "#888" }}>No matches.</li>
          )}
          {results.map((hit, i) => (
            <li
              key={`${hit.kind}-${i}`}
              onClick={() => handleClick(hit)}
              style={{
                padding: "0.625rem 1rem",
                borderBottom: "1px solid #f0f0f0",
                cursor: hit.kind === "note" ? "pointer" : "default",
                display: "flex",
                gap: "0.75rem",
                alignItems: "baseline",
              }}
            >
              <span
                style={{
                  fontSize: "0.875rem",
                  minWidth: "1.25rem",
                  color: hit.kind === "note" ? "#4f46e5" : "#a16207",
                }}
                title={hit.kind === "note" ? "Note" : "Daily Note Block"}
              >
                {hit.kind === "note" ? "📄" : "⚡"}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500 }}>
                  {hit.kind === "note"
                    ? hit.title ?? "(untitled)"
                    : `${hit.dailyDate}${hit.time ? ` · ${hit.time}` : ""}`}
                </div>
                <div
                  style={{
                    fontSize: "0.8125rem",
                    color: "#666",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {hit.snippet}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
