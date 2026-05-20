// Collapsible backlinks panel shown under the open Note. Subscribes to the
// backlinks tag so any Note or Daily Note save anywhere in the Vault refreshes
// the list automatically.
//
// Block sources can't be navigated to in v0 (Daily Notes view lands in slice
// #12), so they render as read-only context rows. Note sources open the
// linked Note when clicked.

import { useState } from "react";
import { useGetBacklinksQuery } from "./notesApi";

export interface BacklinksPanelProps {
  noteId: string;
  onOpenNote: (id: string) => void;
}

export function BacklinksPanel({ noteId, onOpenNote }: BacklinksPanelProps) {
  const [open, setOpen] = useState(true);
  const { data, isLoading } = useGetBacklinksQuery(noteId);

  const backlinks = data?.backlinks ?? [];
  const count = backlinks.length;

  return (
    <section
      style={{
        borderTop: "1px solid #e5e5e5",
        marginTop: "1rem",
        paddingTop: "0.75rem",
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          color: "#666",
          fontSize: "0.8125rem",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {open ? "▾" : "▸"} Backlinks ({isLoading ? "…" : count})
      </button>

      {open && !isLoading && count === 0 && (
        <p style={{ color: "#888", fontSize: "0.875rem", marginTop: "0.5rem" }}>
          Nothing links here yet.
        </p>
      )}

      {open && count > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "0.5rem 0 0" }}>
          {backlinks.map((b, i) =>
            b.kind === "note" ? (
              <li key={`n:${b.noteId}:${i}`} style={{ marginBottom: "0.5rem" }}>
                <button
                  onClick={() => onOpenNote(b.noteId)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "0.5rem 0.625rem",
                    border: "1px solid #eee",
                    background: "#fafafa",
                    borderRadius: "0.25rem",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: "0.8125rem", color: "#224", fontWeight: 500 }}>
                    {b.title ?? b.noteId}
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "#666", marginTop: "0.25rem" }}>
                    {b.snippet}
                  </div>
                </button>
              </li>
            ) : (
              <li
                key={`b:${b.dailyDate}:${b.blockIndex}:${i}`}
                style={{
                  marginBottom: "0.5rem",
                  padding: "0.5rem 0.625rem",
                  border: "1px solid #eee",
                  background: "#fafafa",
                  borderRadius: "0.25rem",
                }}
              >
                <div style={{ fontSize: "0.8125rem", color: "#224", fontWeight: 500 }}>
                  Daily {b.dailyDate}
                  {b.time ? ` · ${b.time}` : ""}
                </div>
                <div style={{ fontSize: "0.8125rem", color: "#666", marginTop: "0.25rem" }}>
                  {b.snippet}
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}
