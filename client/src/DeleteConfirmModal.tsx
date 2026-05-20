// Reusable confirmation surface for destructive operations. Used by both
// NotesSidebar and DailySidebar when the user clicks a trash icon. The
// parent owns the open/close state and the actual delete call — this
// component only renders the surface and emits onConfirm / onCancel.

import { useEffect } from "react";
import { TrashIcon } from "@heroicons/react/24/outline";

export interface DeleteConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmModal({
  open,
  title,
  description,
  busy,
  onConfirm,
  onCancel,
}: DeleteConfirmModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="Confirm delete"
      className="fixed inset-0 z-100 flex items-start justify-center bg-neutral-950/40 px-4 pt-[20vh] backdrop-blur-sm"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/5"
      >
        <header className="flex items-start gap-3 border-b border-neutral-950/5 px-5 py-4">
          <TrashIcon
            aria-hidden="true"
            className="size-5 shrink-0 text-red-600"
          />
          <div>
            <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
            <p className="mt-1 text-sm text-pretty text-neutral-600">
              {description}
            </p>
          </div>
        </header>
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
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white ring-1 ring-red-600 hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:ring-neutral-300"
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </footer>
      </div>
    </div>
  );
}
