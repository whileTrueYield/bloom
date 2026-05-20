// Vault file watcher: keeps the Index in sync with the Vault when files change
// outside Bloom (Obsidian, vim, Finder). Wires three concerns together:
//
//   1. A Node fs.watch handle scoped to the Vault root (recursive).
//   2. The pure WatchQueue, which debounces bursts and skips self-writes.
//   3. The Indexer, which is called on flush after we classify the path and
//      check whether the file still exists.

import { watch, type FSWatcher } from "node:fs";
import { stat } from "node:fs/promises";
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

  const queue: WatchQueue = createWatchQueue({
    debounceMs,
    onFlush: async (absPath) => {
      if (stopped) return;
      const classified = classifyVaultPath(opts.vaultPath, absPath);
      if (classified.kind === "ignored") return;

      // Existence check happens at flush time so a quick "delete then recreate"
      // is treated as a change rather than a delete.
      let exists = true;
      try {
        await stat(absPath);
      } catch {
        exists = false;
      }
      // stop() may have run during the stat() yield (especially in tests where
      // teardown follows hot on the heels of the fs event). Re-check here so
      // we don't issue indexer calls against a closed DB.
      if (stopped) return;

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
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
