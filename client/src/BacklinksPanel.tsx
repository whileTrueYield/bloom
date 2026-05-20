// Backlinks rail. Subscribes to the backlinks tag so any Note or Daily Note
// save anywhere in the Vault refreshes the list automatically. Note sources
// open the linked Note; Block sources open the Daily Note with the Block
// scrolled into view.

import { useState } from "react";
import { useGetBacklinksQuery } from "./notesApi";

export interface BacklinksPanelProps {
  noteId: string;
  onOpenNote: (id: string) => void;
  onOpenBlock: (date: string, blockIndex: number) => void;
}

export function BacklinksPanel({
  noteId,
  onOpenNote,
  onOpenBlock,
}: BacklinksPanelProps) {
  const [open, setOpen] = useState(true);
  const { data, isLoading } = useGetBacklinksQuery(noteId);

  const backlinks = data?.backlinks ?? [];
  const count = backlinks.length;

  return (
    <section aria-label="Backlinks" className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center justify-between rounded-md px-1 py-0.5 font-mono text-xs tracking-wide text-neutral-500 uppercase hover:text-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600"
      >
        <span>
          Backlinks{" "}
          <span className="text-neutral-400 tabular-nums">
            ({isLoading ? "…" : count})
          </span>
        </span>
        <span aria-hidden="true" className="text-neutral-400">
          {open ? "−" : "+"}
        </span>
      </button>

      {open && !isLoading && count === 0 && (
        <p className="px-1 text-sm text-pretty text-neutral-400">
          Nothing links here yet.
        </p>
      )}

      {open && count > 0 && (
        <ul role="list" className="flex flex-col gap-2">
          {backlinks.map((b, i) =>
            b.kind === "note" ? (
              <li key={`n:${b.noteId}:${i}`}>
                <button
                  type="button"
                  onClick={() => onOpenNote(b.noteId)}
                  className="flex w-full flex-col gap-1 rounded-md bg-white px-3 py-2.5 text-left ring-1 ring-neutral-950/5 hover:ring-neutral-950/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600"
                >
                  <span className="truncate text-sm font-medium text-neutral-900">
                    {b.title ?? b.noteId}
                  </span>
                  <span className="line-clamp-2 text-sm text-neutral-500">
                    {b.snippet}
                  </span>
                </button>
              </li>
            ) : (
              <li key={`b:${b.dailyDate}:${b.blockIndex}:${i}`}>
                <button
                  type="button"
                  onClick={() => onOpenBlock(b.dailyDate, b.blockIndex)}
                  className="flex w-full flex-col gap-1 rounded-md bg-neutral-50 px-3 py-2.5 text-left ring-1 ring-neutral-950/5 hover:ring-neutral-950/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600"
                >
                  <span className="flex items-baseline gap-2 text-sm">
                    <span className="font-mono text-xs tracking-wide text-accent-700 uppercase">
                      Daily
                    </span>
                    <span className="font-mono text-xs text-neutral-500 tabular-nums">
                      {b.dailyDate}
                      {b.time ? ` · ${b.time}` : ""}
                    </span>
                  </span>
                  <span className="line-clamp-2 text-sm text-neutral-600">
                    {b.snippet}
                  </span>
                </button>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}
