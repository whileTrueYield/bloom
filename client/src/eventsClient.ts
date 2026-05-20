// Thin EventSource wrapper for /api/events. Bun's test runner doesn't render
// the DOM so this module isn't unit-tested directly — its consumers route
// every received event through the (tested) decideExternalReloadAction.

import type { VaultEvent } from "@shared/types";

export type VaultEventListener = (event: VaultEvent) => void;

export interface EventsConnection {
  close(): void;
}

export function connectToVaultEvents(listener: VaultEventListener): EventsConnection {
  const source = new EventSource("/api/events");

  const onMessage = (kind: VaultEvent["kind"]) => (raw: MessageEvent<string>) => {
    try {
      const parsed = JSON.parse(raw.data) as VaultEvent;
      // Defensive: trust the SSE event name over a malformed payload.
      if (parsed.kind !== kind) return;
      listener(parsed);
    } catch {
      // Drop malformed payloads — the watcher is the only writer, so this
      // would only fire on a transport mishap and there's nothing to do.
    }
  };

  source.addEventListener("note", onMessage("note") as EventListener);
  source.addEventListener("daily", onMessage("daily") as EventListener);

  return {
    close() {
      source.close();
    },
  };
}
