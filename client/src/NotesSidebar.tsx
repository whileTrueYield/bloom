// The Notes sidebar. Renders the live Note list from RTK Query; clicking a
// row opens that Note in the editor. Each row also exposes a hover-revealed
// trash icon that opens a confirmation modal owned by the parent — actual
// deletion happens via a notesApi mutation in the parent.

import { TrashIcon } from "@heroicons/react/24/outline";
import { useListNotesQuery } from "./notesApi";

export interface NotesSidebarProps {
  activeId: string | null;
  onOpen: (id: string) => void;
  onRequestDelete: (id: string) => void;
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

export function NotesSidebar({ activeId, onOpen, onRequestDelete }: NotesSidebarProps) {
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
              <li key={n.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onOpen(n.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={
                    "flex w-full flex-col items-start gap-0.5 rounded-md px-2.5 py-1.5 pr-9 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 " +
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
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRequestDelete(n.id);
                  }}
                  aria-label={`Delete Note ${n.id}`}
                  className="absolute top-1/2 right-1.5 hidden -translate-y-1/2 rounded p-1 text-neutral-400 hover:bg-white hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 group-hover:block"
                >
                  <TrashIcon aria-hidden="true" className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
