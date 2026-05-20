// The Notes sidebar. Renders the live Note list from RTK Query; clicking a
// row opens that Note in the editor. The list shows the Note id (the v0 API
// doesn't surface titles yet) with the last-modified timestamp underneath.

import { useListNotesQuery } from "./notesApi";

export interface NotesSidebarProps {
  activeId: string | null;
  onOpen: (id: string) => void;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

function formatModified(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return dateFormatter.format(d);
}

export function NotesSidebar({ activeId, onOpen }: NotesSidebarProps) {
  const { data, isLoading, isError } = useListNotesQuery();

  return (
    <nav aria-label="Notes" className="flex flex-col gap-2">
      <h2 className="px-1 font-mono text-xs tracking-wide text-neutral-400 uppercase">
        Notes
      </h2>

      {isLoading && (
        <p className="px-1 text-sm text-neutral-400">Loading…</p>
      )}
      {isError && (
        <p className="px-1 text-sm text-red-600">Failed to load notes.</p>
      )}

      {!isLoading && !isError && (data?.notes ?? []).length === 0 && (
        <p className="px-1 text-sm text-pretty text-neutral-500">
          No Notes yet. Press{" "}
          <kbd className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-700">
            ⌘J
          </kbd>{" "}
          to create one.
        </p>
      )}

      {!isLoading && !isError && (data?.notes ?? []).length > 0 && (
        <ul role="list" className="flex flex-col gap-0.5">
          {(data?.notes ?? []).map((n) => {
            const isActive = n.id === activeId;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => onOpen(n.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={
                    "flex w-full flex-col items-start gap-0.5 rounded-md px-2.5 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 " +
                    (isActive
                      ? "bg-accent-50 text-accent-900"
                      : "text-neutral-700 hover:bg-neutral-50")
                  }
                >
                  <span
                    className={
                      "truncate font-mono text-sm " +
                      (isActive ? "text-accent-900" : "text-neutral-800")
                    }
                  >
                    {n.id}
                  </span>
                  <span className="font-mono text-xs text-neutral-400 tabular-nums">
                    {formatModified(n.modified)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
