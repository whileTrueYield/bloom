// Confirmation surface for the Note rename pipeline (#14). When a save would
// rewrite more than RENAME_CONFIRM_THRESHOLD references, the server replies
// 409 RENAME_NEEDS_CONFIRM with a preview plan instead of touching disk.
// This modal renders that plan so the user can review which files will be
// rewritten before confirming.

import { useEffect } from "react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import type { RenamePlanSummary } from "@shared/types";

export interface RenameConfirmModalProps {
  plan: RenamePlanSummary | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function RenameConfirmModal({
  plan,
  busy,
  onConfirm,
  onCancel,
}: RenameConfirmModalProps) {
  useEffect(() => {
    if (!plan) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [plan, onCancel]);

  if (!plan) return null;

  const noteCount = plan.sources.filter((s) => s.kind === "note").length;
  const dailyCount = plan.sources.filter((s) => s.kind === "daily").length;

  return (
    <div
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="Confirm rename"
      className="fixed inset-0 z-100 flex items-start justify-center bg-neutral-950/40 px-4 pt-[15vh] backdrop-blur-sm"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/5"
      >
        <header className="flex items-start gap-3 border-b border-neutral-950/5 px-5 py-4">
          <ExclamationTriangleIcon
            aria-hidden="true"
            className="size-5 shrink-0 text-amber-600"
          />
          <div>
            <h2 className="text-base font-semibold text-neutral-900">
              Rename will rewrite {plan.totalReferences} reference
              {plan.totalReferences === 1 ? "" : "s"}
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Title change from{" "}
              <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs text-neutral-700">
                {plan.oldTitle}
              </code>{" "}
              to{" "}
              <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs text-neutral-700">
                {plan.newTitle}
              </code>
              . Every <code className="font-mono text-xs">[[{plan.oldTitle}]]</code>{" "}
              wikilink across the Vault will be updated.
            </p>
          </div>
        </header>

        <div className="max-h-[40vh] overflow-y-auto px-5 py-4">
          <p className="text-xs font-mono tracking-wide text-neutral-400 uppercase">
            Affected files ({noteCount} Note{noteCount === 1 ? "" : "s"},{" "}
            {dailyCount} Daily Note{dailyCount === 1 ? "" : "s"})
          </p>
          <ul role="list" className="mt-2 flex flex-col gap-1.5">
            {plan.sources.map((s, i) => (
              <li
                key={`${s.kind}:${s.noteId ?? s.dailyDate ?? i}`}
                className="flex items-baseline justify-between gap-3 rounded-md bg-neutral-50 px-3 py-2 ring-1 ring-neutral-950/5"
              >
                <span className="flex items-baseline gap-2 truncate text-sm">
                  <span className="font-mono text-xs tracking-wide text-accent-700 uppercase">
                    {s.kind === "note" ? "Note" : "Daily"}
                  </span>
                  <span className="truncate font-mono text-xs text-neutral-700">
                    {s.kind === "note" ? s.noteId : s.dailyDate}
                  </span>
                </span>
                <span className="font-mono text-xs text-neutral-500 tabular-nums">
                  {s.count} ref{s.count === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-neutral-950/5 bg-neutral-50 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy}
            className="rounded-md bg-accent-700 px-3 py-1.5 text-sm font-medium text-white ring-1 ring-accent-700 hover:bg-accent-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:ring-neutral-300"
          >
            {busy ? "Renaming…" : "Confirm rename"}
          </button>
        </footer>
      </div>
    </div>
  );
}
