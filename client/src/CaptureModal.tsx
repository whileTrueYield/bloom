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
          width: "min(36rem, 90vw)",
          background: "white",
          borderRadius: "0.5rem",
          boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
          padding: "1.25rem",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <header style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
          <strong>Capture</strong>
          <span style={{ color: "#888", fontSize: "0.8125rem" }}>
            Enter to save · Esc to close · Shift+Enter for newline
          </span>
        </header>

        <textarea
          ref={inputRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          rows={4}
          placeholder="Quick thought…"
          style={{
            display: "block",
            width: "100%",
            marginTop: "0.75rem",
            padding: "0.5rem",
            fontFamily: "ui-monospace, monospace",
            fontSize: "0.9375rem",
            resize: "vertical",
            border: "1px solid #ddd",
            borderRadius: "0.25rem",
          }}
        />

        <footer
          style={{
            marginTop: "0.75rem",
            color: "#666",
            fontSize: "0.8125rem",
            minHeight: "1.25rem",
          }}
        >
          {status.kind === "idle" && "Geolocation captured on save."}
          {status.kind === "saving" &&
            (status.geo
              ? `📍 ${status.geo.lat.toFixed(4)}, ${status.geo.lon.toFixed(4)} · saving…`
              : "📍 no location available · saving without geo…")}
          {status.kind === "error" && (
            <span style={{ color: "#b00020" }}>{status.message}</span>
          )}
        </footer>
      </div>
    </div>
  );
}
