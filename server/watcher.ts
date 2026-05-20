// Vault file watcher: keeps the Index in sync with the Vault when files change
// outside Bloom (Obsidian, vim, Finder). Wires three concerns together:
//
//   1. A Node fs.watch handle scoped to the Vault root (recursive).
//   2. The pure WatchQueue, which debounces bursts and skips self-writes.
//   3. The Indexer, which is called on flush after we classify the path and
//      check whether the file still exists.

import { readFileSync, watch, type FSWatcher } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import type { Indexer } from "./indexer";
import { createWatchQueue, type WatchQueue } from "./watchQueue";
import { classifyVaultPath } from "./watchClassify";
import type { VaultEvent } from "@shared/types";

export interface VaultWatcherOptions {
  vaultPath: string;
  indexer: Indexer;
  debounceMs?: number;
}

export type VaultEventListener = (event: VaultEvent) => void;

export interface VaultWatcher {
  start(): void;
  stop(): void;
  // Called by Bloom's writers (createNote / saveNote / appendBlock) right
  // before or after they touch the filesystem so the resulting fs event is
  // suppressed.
  markSelfWrite(absPath: string): void;
  // Subscribe to indexed-and-classified events. Returns an unsubscribe fn.
  subscribe(listener: VaultEventListener): () => void;
}

export function createVaultWatcher(opts: VaultWatcherOptions): VaultWatcher {
  const debounceMs = opts.debounceMs ?? 250;
  let fsWatcher: FSWatcher | null = null;
  let stopped = false;

  const listeners = new Set<VaultEventListener>();
  const publish = (event: VaultEvent) => {
    for (const l of listeners) l(event);
  };

  // Per-path sha of the bytes we last observed (either via an onFlush we let
  // through, or via the writer-side markSelfWrite that captures the bytes we
  // just wrote). macOS / iCloud / Spotlight happily fire fs.watch events
  // whose file content matches what we just wrote — xattr touches and
  // FSEvents echoes that leak past the self-write TTL. The cache turns
  // those into no-ops while still catching genuine external edits.
  const contentHashCache = new Map<string, string>();

  function hashBytes(bytes: Buffer): string {
    return createHash("sha256").update(bytes).digest("hex");
  }

  const queue: WatchQueue = createWatchQueue({
    debounceMs,
    onFlush: async (absPath) => {
      if (stopped) return;
      const classified = classifyVaultPath(opts.vaultPath, absPath);
      if (classified.kind === "ignored") return;

      // Read + hash the current bytes. readFile failing with ENOENT (or any
      // other reason) means the file is gone — treat as a delete.
      let currentBytes: Buffer | null = null;
      try {
        currentBytes = await readFile(absPath);
      } catch {
        currentBytes = null;
      }
      // stop() may have run during the readFile yield (especially in tests
      // where teardown follows hot on the heels of the fs event). Re-check
      // here so we don't issue indexer calls against a closed DB.
      if (stopped) return;
      const exists = currentBytes !== null;
      const currentHash = currentBytes ? hashBytes(currentBytes) : null;

      // Hash dedupe: same content as last seen ⇒ no-op event (xattr touch,
      // FSEvents echo, our own write that bled past the self-write TTL).
      const cachedHash = contentHashCache.get(absPath);
      if (exists && cachedHash === currentHash) return;

      if (exists && currentHash) {
        contentHashCache.set(absPath, currentHash);
      } else {
        contentHashCache.delete(absPath);
      }

      if (classified.kind === "note") {
        if (exists) {
          await opts.indexer.indexNote(classified.noteId);
          if (stopped) return;
          publish({ kind: "note", noteId: classified.noteId, action: "changed" });
        } else {
          opts.indexer.deleteNote(classified.noteId);
          publish({ kind: "note", noteId: classified.noteId, action: "deleted" });
        }
      } else {
        await opts.indexer.indexDailyNote(classified.dailyDate);
        if (stopped) return;
        publish({
          kind: "daily",
          dailyDate: classified.dailyDate,
          action: exists ? "changed" : "deleted",
        });
      }
    },
  });

  return {
    start() {
      if (fsWatcher || stopped) return;
      fsWatcher = watch(opts.vaultPath, { recursive: true }, (_eventType, filename) => {
        if (stopped || !filename) return;
        const absPath = path.join(opts.vaultPath, filename);
        // Cheap early filter to avoid spinning a timer for paths we'd drop
        // at flush time anyway (attachments, .DS_Store, atomic-save tmp files).
        if (classifyVaultPath(opts.vaultPath, absPath).kind === "ignored") return;
        queue.enqueue(absPath);
      });
    },
    stop() {
      stopped = true;
      if (fsWatcher) {
        fsWatcher.close();
        fsWatcher = null;
      }
      queue.stop();
    },
    markSelfWrite(absPath) {
      queue.markSelfWrite(absPath);
      // Snapshot the bytes we just wrote so any later fs event whose content
      // matches is deduped at flush time. Sync read keeps the API a one-liner
      // for callers; Note files are kilobytes so the cost is negligible.
      // If the read fails (deleted path, transient race), drop the entry —
      // a future flush will treat the next event as genuine and re-cache.
      try {
        contentHashCache.set(absPath, hashBytes(readFileSync(absPath)));
      } catch {
        contentHashCache.delete(absPath);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
