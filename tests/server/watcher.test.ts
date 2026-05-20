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
