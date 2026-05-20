// WatchQueue: pure debounce + dedupe + self-write skip for the Vault file
// watcher. Owns no I/O — `enqueue` is fed by the fs.watch handler and the
// `onFlush` callback drives whatever the caller wants (typically: re-index
// and broadcast over SSE).
//
// Self-write skipping lets the writer side mark a path as "we're about to
// touch this — ignore the next event for it" so Bloom's own saves don't
// trigger spurious re-indexing.

export interface WatchQueueOptions {
  debounceMs: number;
  // How long a markSelfWrite suppression lives before expiring on its own.
  // Defaults to 2× debounceMs so the suppression always outlives the
  // following debounce window when the FS event arrives promptly.
  selfWriteTtlMs?: number;
  onFlush: (absPath: string) => void;
}

export interface WatchQueue {
  enqueue(absPath: string): void;
  markSelfWrite(absPath: string): void;
  stop(): void;
}

export function createWatchQueue(opts: WatchQueueOptions): WatchQueue {
  const ttl = opts.selfWriteTtlMs ?? opts.debounceMs * 2;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  // Per-path expiration deadlines for self-write suppressions. We use a
  // deadline rather than a counter so a marker expires naturally if the
  // expected event never arrives — the next genuine external edit isn't eaten.
  const suppressUntil = new Map<string, number>();
  const suppressTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let stopped = false;

  return {
    enqueue(absPath) {
      if (stopped) return;
      const deadline = suppressUntil.get(absPath);
      if (deadline !== undefined && Date.now() <= deadline) {
        // Consume the marker — only the first event after a self-write is
        // suppressed; subsequent events (truly external) flow through.
        const st = suppressTimers.get(absPath);
        if (st) clearTimeout(st);
        suppressTimers.delete(absPath);
        suppressUntil.delete(absPath);
        return;
      }

      const existing = timers.get(absPath);
      if (existing) clearTimeout(existing);
      const t = setTimeout(() => {
        timers.delete(absPath);
        opts.onFlush(absPath);
      }, opts.debounceMs);
      timers.set(absPath, t);
    },
    markSelfWrite(absPath) {
      if (stopped) return;
      // Cancel any flush already queued for this path. This lets writers mark
      // self-writes immediately after their write returns: if the fs event has
      // already raced ahead and enqueued, the marker still cancels it.
      const pending = timers.get(absPath);
      if (pending) {
        clearTimeout(pending);
        timers.delete(absPath);
      }
      const existing = suppressTimers.get(absPath);
      if (existing) clearTimeout(existing);
      suppressUntil.set(absPath, Date.now() + ttl);
      const st = setTimeout(() => {
        suppressUntil.delete(absPath);
        suppressTimers.delete(absPath);
      }, ttl);
      suppressTimers.set(absPath, st);
    },
    stop() {
      stopped = true;
      for (const t of timers.values()) clearTimeout(t);
      for (const t of suppressTimers.values()) clearTimeout(t);
      timers.clear();
      suppressTimers.clear();
      suppressUntil.clear();
    },
  };
}
