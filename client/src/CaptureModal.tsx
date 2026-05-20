// The Capture modal. A small floating overlay anchored near the top of the
// viewport. Enter saves, Esc closes. Geolocation is fetched on submit (not
// on open) so the user isn't forced to wait when they're moving fast — if
// the lookup fails or is denied, the capture still saves without geo.

import { useEffect, useRef, useState } from "react";
import { useCaptureMutation } from "./captureApi";
import { getCurrentGeo, type CapturedGeo } from "./geolocation";

type Status =
  | { kind: "idle" }
  | { kind: "saving"; geo: CapturedGeo | null }
  | { kind: "error"; message: string };

export interface CaptureModalProps {
  open: boolean;
  onClose: () => void;
}

export function CaptureModal({ open, onClose }: CaptureModalProps) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [capture] = useCaptureMutation();

  // Focus on open, reset state on close.
  useEffect(() => {
    if (open) {
      setText("");
      setStatus({ kind: "idle" });
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Esc closes the modal at any time.
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

  if (!open) return null;

  const submit = async () => {
    const value = text.trim();
    if (!value) return;

    const geo = await getCurrentGeo();
    setStatus({ kind: "saving", geo });

    try {
      await capture({
        text: value,
        ...(geo ? { geo } : {}),
      }).unwrap();
      onClose();
    } catch (err) {
      setStatus({
        kind: "error",
        message: (err as { error?: string }).error ?? "Capture failed.",
      });
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter alone submits; Shift+Enter inserts a newline so multi-line
    // captures stay possible.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Capture a quick thought"
      className="fixed inset-0 z-100 flex items-start justify-center bg-neutral-950/40 px-4 pt-[10vh] backdrop-blur-sm"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-xl bg-white p-5 shadow-2xl ring-1 ring-black/5"
      >
        <header className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-neutral-900">Capture</h2>
          <p className="font-mono text-xs text-neutral-400">
            <kbd>↵</kbd> save · <kbd>⇧↵</kbd> newline · <kbd>esc</kbd> close
          </p>
        </header>

        <textarea
          ref={inputRef}
          name="capture"
          aria-label="Capture text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          rows={4}
          placeholder="Quick thought…"
          className="mt-3 block w-full resize-y rounded-md bg-white px-3 py-2 font-mono text-sm/6 text-neutral-900 ring-1 ring-neutral-950/10 outline-none placeholder:text-neutral-400 focus:ring-2 focus:ring-accent-600 max-sm:text-base/6"
        />

        <footer
          className="mt-3 min-h-5 text-sm text-neutral-500"
          aria-live="polite"
        >
          {status.kind === "idle" && "Geolocation captured on save."}
          {status.kind === "saving" &&
            (status.geo
              ? `Pin ${status.geo.lat.toFixed(4)}, ${status.geo.lon.toFixed(4)} · saving…`
              : "No location available · saving without geo…")}
          {status.kind === "error" && (
            <span className="text-red-600">{status.message}</span>
          )}
        </footer>
      </div>
    </div>
  );
}
