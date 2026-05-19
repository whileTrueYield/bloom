// The notes sidebar. Renders the live note list from RTK Query; clicking a
// row opens that Note in the editor.

import { useListNotesQuery } from "./notesApi";

export interface NotesSidebarProps {
  activeId: string | null;
  onOpen: (id: string) => void;
}

export function NotesSidebar({ activeId, onOpen }: NotesSidebarProps) {
  const { data, isLoading, isError } = useListNotesQuery();

  if (isLoading) return <p style={{ color: "#666" }}>Loading…</p>;
  if (isError) return <p style={{ color: "#b00020" }}>Failed to load notes.</p>;

  const notes = data?.notes ?? [];

  return (
    <nav>
      <h2 style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#888" }}>
        Notes
      </h2>
      {notes.length === 0 ? (
        <p style={{ color: "#888", fontSize: "0.875rem" }}>
          No notes yet. Press <kbd>⌘J</kbd> to create one.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {notes.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => onOpen(n.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "0.5rem 0.75rem",
                  border: "none",
                  background: n.id === activeId ? "#eef" : "transparent",
                  cursor: "pointer",
                  fontFamily: "ui-monospace, monospace",
                  fontSize: "0.8125rem",
                  color: n.id === activeId ? "#224" : "#444",
                  borderRadius: "0.25rem",
                }}
              >
                {n.id}
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
