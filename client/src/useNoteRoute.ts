// URL-hash-driven routing for "which Note is currently open."
//
// Why the hash and not the path: a hash change pushes to the browser
// history automatically and fires `hashchange`, so browser back/forward
// works for free without any router library. The URL stays clean
// (`localhost:5173/#note/<id>`) and survives reload.

import { useCallback, useEffect, useState } from "react";

const HASH_PATTERN = /^#note\/(.+)$/;

function readHash(): string | null {
  if (typeof window === "undefined") return null;
  const match = window.location.hash.match(HASH_PATTERN);
  return match ? decodeURIComponent(match[1]!) : null;
}

export function useNoteRoute(): readonly [
  noteId: string | null,
  setNoteId: (id: string | null) => void,
] {
  const [noteId, setLocalNoteId] = useState<string | null>(readHash);

  useEffect(() => {
    const sync = () => setLocalNoteId(readHash());
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  const setNoteId = useCallback((next: string | null) => {
    const newHash = next ? `#note/${encodeURIComponent(next)}` : "";
    if (window.location.hash !== newHash) {
      // Setting hash auto-pushes to history. We rely on the `hashchange`
      // listener above to keep React state in sync rather than calling
      // setLocalNoteId directly — single source of truth.
      window.location.hash = newHash;
    }
  }, []);

  return [noteId, setNoteId] as const;
}
