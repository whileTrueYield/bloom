// Pure debounce + dedupe + self-write-skip logic for the Vault file watcher.
// All tests use real timers with a small debounce window so the suite stays
// fast while still exercising the time-based behavior end-to-end.

import { describe, it, expect } from "bun:test";
import { createWatchQueue } from "@server/watchQueue";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("createWatchQueue", () => {
  it("flushes a single enqueued path after the debounce window", async () => {
    const flushed: string[] = [];
    const queue = createWatchQueue({
      debounceMs: 20,
      onFlush: (p) => flushed.push(p),
    });

    queue.enqueue("/v/notes/a.md");
    expect(flushed).toEqual([]);

    await wait(40);
    expect(flushed).toEqual(["/v/notes/a.md"]);

    queue.stop();
  });

  it("coalesces a burst of events for the same path into a single flush", async () => {
    const flushed: string[] = [];
    const queue = createWatchQueue({
      debounceMs: 30,
      onFlush: (p) => flushed.push(p),
    });

    queue.enqueue("/v/notes/a.md");
    await wait(10);
    queue.enqueue("/v/notes/a.md");
    await wait(10);
    queue.enqueue("/v/notes/a.md");

    await wait(50);
    expect(flushed).toEqual(["/v/notes/a.md"]);

    queue.stop();
  });

  it("suppresses the first enqueue after markSelfWrite for the same path", async () => {
    const flushed: string[] = [];
    const queue = createWatchQueue({
      debounceMs: 20,
      onFlush: (p) => flushed.push(p),
    });

    queue.markSelfWrite("/v/notes/a.md");
    queue.enqueue("/v/notes/a.md");

    await wait(40);
    expect(flushed).toEqual([]);

    queue.stop();
  });

  it("suppresses every enqueue inside the TTL window — macOS FSEvents can echo multiple events for one atomic write", async () => {
    const flushed: string[] = [];
    const queue = createWatchQueue({
      debounceMs: 20,
      selfWriteTtlMs: 100,
      onFlush: (p) => flushed.push(p),
    });

    queue.markSelfWrite("/v/notes/a.md");
    queue.enqueue("/v/notes/a.md");
    await wait(20);
    queue.enqueue("/v/notes/a.md");
    await wait(20);
    queue.enqueue("/v/notes/a.md");

    await wait(60);
    expect(flushed).toEqual([]);

    queue.stop();
  });

  it("lets through enqueues that arrive after the TTL has expired", async () => {
    const flushed: string[] = [];
    const queue = createWatchQueue({
      debounceMs: 20,
      selfWriteTtlMs: 40,
      onFlush: (p) => flushed.push(p),
    });

    queue.markSelfWrite("/v/notes/a.md");
    await wait(60); // marker expires
    queue.enqueue("/v/notes/a.md");
    await wait(40);
    expect(flushed).toEqual(["/v/notes/a.md"]);

    queue.stop();
  });

  it("cancels an already-pending flush when markSelfWrite arrives after enqueue", async () => {
    // Writer-side flow: file is written, fs event arrives and enqueues, then
    // the writer (in the same JS tick after `await write()`) marks the path
    // as a self-write. The pending flush must be cancelled.
    const flushed: string[] = [];
    const queue = createWatchQueue({
      debounceMs: 40,
      onFlush: (p) => flushed.push(p),
    });

    queue.enqueue("/v/notes/a.md");
    queue.markSelfWrite("/v/notes/a.md");

    await wait(80);
    expect(flushed).toEqual([]);

    queue.stop();
  });

  it("expires a stale self-write marker so it doesn't eat a much later external event", async () => {
    const flushed: string[] = [];
    const queue = createWatchQueue({
      debounceMs: 10,
      selfWriteTtlMs: 30,
      onFlush: (p) => flushed.push(p),
    });

    queue.markSelfWrite("/v/notes/a.md");
    await wait(60); // marker expires before any event arrives
    queue.enqueue("/v/notes/a.md");
    await wait(30);
    expect(flushed).toEqual(["/v/notes/a.md"]);

    queue.stop();
  });

  it("flushes distinct paths independently", async () => {
    const flushed: string[] = [];
    const queue = createWatchQueue({
      debounceMs: 20,
      onFlush: (p) => flushed.push(p),
    });

    queue.enqueue("/v/notes/a.md");
    queue.enqueue("/v/notes/b.md");

    await wait(40);
    expect(flushed.sort()).toEqual(["/v/notes/a.md", "/v/notes/b.md"]);

    queue.stop();
  });
});
