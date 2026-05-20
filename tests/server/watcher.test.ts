// Vault file watcher integration tests. Uses real fs.watch over a real temp
// Vault and a recording fake Indexer so we can assert on routing decisions
// without coupling to the SQLite layer.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { bootstrapVaultLayout } from "@server/vault";
import { createVaultWatcher, type VaultWatcher } from "@server/watcher";
import type { Indexer } from "@server/indexer";

interface FakeIndexer extends Indexer {
  calls: Array<
    | { method: "indexNote"; noteId: string }
    | { method: "indexDailyNote"; date: string }
    | { method: "deleteNote"; noteId: string }
  >;
}

function createFakeIndexer(): FakeIndexer {
  const calls: FakeIndexer["calls"] = [];
  return {
    calls,
    async indexNote(noteId) {
      calls.push({ method: "indexNote", noteId });
    },
    async indexDailyNote(date) {
      calls.push({ method: "indexDailyNote", date });
    },
    deleteNote(noteId) {
      calls.push({ method: "deleteNote", noteId });
    },
    async rebuild() {
      return { notes: 0, daily: 0 };
    },
    search() {
      return [];
    },
    getBacklinks() {
      return [];
    },
    async stats() {
      return { notes: 0, daily: 0, blocks: 0, wikilinks: 0, sizeBytes: 0 };
    },
    close() {},
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let workdir: string;
let vaultPath: string;
let indexer: FakeIndexer;
let watcher: VaultWatcher;

beforeEach(async () => {
  workdir = await mkdtemp(path.join(tmpdir(), "bloom-watcher-"));
  vaultPath = path.join(workdir, "vault");
  await mkdir(vaultPath);
  await bootstrapVaultLayout(vaultPath);
  indexer = createFakeIndexer();
  watcher = createVaultWatcher({
    vaultPath,
    indexer,
    debounceMs: 30,
  });
  watcher.start();
  // Give fs.watch a moment to actually attach before tests fire events.
  await wait(50);
});

afterEach(async () => {
  watcher.stop();
  await rm(workdir, { recursive: true, force: true });
});

describe("createVaultWatcher — Note files", () => {
  it("indexes a Note when it is created externally", async () => {
    const id = "20260519T100000000";
    await writeFile(
      path.join(vaultPath, "notes", `${id}.md`),
      "---\nid: 20260519T100000000\n---\n# External\n\nbody\n",
    );

    await wait(150);

    const noteCalls = indexer.calls.filter((c) => c.method === "indexNote");
    expect(noteCalls).toEqual([{ method: "indexNote", noteId: id }]);
  });

  it("calls deleteNote when a Note file is removed externally", async () => {
    const id = "20260519T100000001";
    const filePath = path.join(vaultPath, "notes", `${id}.md`);
    await writeFile(filePath, "---\nid: 20260519T100000001\n---\n# X\n");
    await wait(150);
    indexer.calls.length = 0;

    await unlink(filePath);
    await wait(150);

    const deleteCalls = indexer.calls.filter((c) => c.method === "deleteNote");
    expect(deleteCalls).toEqual([{ method: "deleteNote", noteId: id }]);
  });
});

describe("createVaultWatcher — Daily Notes", () => {
  it("indexes a Daily Note when its file is created externally", async () => {
    const date = "2026-05-19";
    await writeFile(
      path.join(vaultPath, "daily", `${date}.md`),
      "---\ndate: 2026-05-19\n---\n## 10:00\nhello\n",
    );

    await wait(150);

    const dailyCalls = indexer.calls.filter((c) => c.method === "indexDailyNote");
    expect(dailyCalls).toEqual([{ method: "indexDailyNote", date }]);
  });
});

describe("createVaultWatcher — self-write skip", () => {
  it("does not re-index a path that was marked as a self-write before the event arrived", async () => {
    const id = "20260519T100000002";
    const filePath = path.join(vaultPath, "notes", `${id}.md`);

    watcher.markSelfWrite(filePath);
    await writeFile(filePath, "---\nid: 20260519T100000002\n---\n# Self\n");

    await wait(200);

    const noteCalls = indexer.calls.filter((c) => c.method === "indexNote");
    expect(noteCalls).toEqual([]);
  });

  // Regression test for the "phantom external edit" bug: macOS / iCloud /
  // Spotlight touch xattrs on a file shortly after we write it, firing
  // fs.watch events whose content matches what we just wrote. These used to
  // leak past the self-write TTL and surface as an external-edit prompt in
  // the editor. The watcher should dedupe on file content hash.
  it("skips events whose file content is identical to what was last seen", async () => {
    const id = "20260519T100000099";
    const filePath = path.join(vaultPath, "notes", `${id}.md`);
    const bytes = "---\nid: 20260519T100000099\n---\n# Same\n";

    // First write establishes the cache entry through the normal flush path.
    await writeFile(filePath, bytes);
    await wait(150);
    expect(indexer.calls.filter((c) => c.method === "indexNote")).toEqual([
      { method: "indexNote", noteId: id },
    ]);
    indexer.calls.length = 0;

    // Simulate an xattr-only / FSEvents-echo event: rewrite the exact same
    // bytes. Without content dedupe this would fire a second indexNote + a
    // "note changed" publish for the still-open editor.
    await writeFile(filePath, bytes);
    await wait(150);
    expect(indexer.calls.filter((c) => c.method === "indexNote")).toEqual([]);
  });

  // Regression test for the new-note + type repro: after our save lands the
  // OS fires a late echo carrying our just-saved bytes. The watcher's cache
  // is populated by markSelfWrite at the moment of the write, so the echo
  // (same bytes, fired well past the suppression TTL) is suppressed.
  it("dedupes a late echo whose content matches the bytes we just wrote", async () => {
    const id = "20260519T100000100";
    const filePath = path.join(vaultPath, "notes", `${id}.md`);
    const firstBytes = "---\nid: 20260519T100000100\n---\n# Initial\n";
    const savedBytes = "---\nid: 20260519T100000100\n---\n# Saved body\n";

    // Initial write seeds the cache through the normal flush.
    await writeFile(filePath, firstBytes);
    await wait(150);
    indexer.calls.length = 0;

    // Simulate a Bloom-side save: write the new bytes, then mark the path
    // (the convention every writer in app.ts now follows).
    await writeFile(filePath, savedBytes);
    watcher.markSelfWrite(filePath);

    // The watcher's TTL suppresses immediate echoes. Wait past the default
    // suppression window so the second echo races without that safety net.
    await wait(1100);

    // A late echo with the same bytes fires now — this is the macOS / iCloud
    // pattern that produced the "External Bloom edit" modal. The cache must
    // recognise it as a no-op.
    await writeFile(filePath, savedBytes);
    await wait(150);
    expect(indexer.calls.filter((c) => c.method === "indexNote")).toEqual([]);
  });
});

describe("createVaultWatcher — subscribers", () => {
  it("delivers events to all active subscribers and stops after unsubscribe", async () => {
    const received: Array<{ who: string; event: unknown }> = [];
    const offA = watcher.subscribe((e) => received.push({ who: "a", event: e }));
    const offB = watcher.subscribe((e) => received.push({ who: "b", event: e }));

    const id = "20260519T100000003";
    await writeFile(
      path.join(vaultPath, "notes", `${id}.md`),
      "---\nid: 20260519T100000003\n---\n# Sub\n",
    );
    await wait(150);

    expect(received.map((r) => r.who).sort()).toEqual(["a", "b"]);
    expect(received[0]!.event).toEqual({
      kind: "note",
      noteId: id,
      action: "changed",
    });

    offA();
    received.length = 0;

    await writeFile(
      path.join(vaultPath, "notes", `${id}.md`),
      "---\nid: 20260519T100000003\n---\n# Sub edited\n",
    );
    await wait(150);

    expect(received.map((r) => r.who)).toEqual(["b"]);
    offB();
  });
});

describe("createVaultWatcher — irrelevant files", () => {
  it("ignores files in attachments/", async () => {
    await writeFile(path.join(vaultPath, "attachments", "cat.png"), "binary-ish");
    await wait(150);
    expect(indexer.calls).toEqual([]);
  });
});
