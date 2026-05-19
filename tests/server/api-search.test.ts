// /api/search and /api/index/rebuild integration tests. Verifies the wiring
// between mutation endpoints, the Indexer, and the search route.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "@server/app";
import { bootstrapVaultLayout } from "@server/vault";
import { saveSettings } from "@server/settings";
import type {
  IndexRebuildResponse,
  NoteResponse,
  SearchResponse,
} from "@shared/types";

let workdir: string;
let vaultPath: string;
let settingsPath: string;
let indexRoot: string;

beforeEach(async () => {
  workdir = await mkdtemp(path.join(tmpdir(), "bloom-api-search-"));
  vaultPath = path.join(workdir, "vault");
  settingsPath = path.join(workdir, "settings.json");
  indexRoot = path.join(workdir, "index");
  await mkdir(vaultPath);
  await bootstrapVaultLayout(vaultPath);
  await saveSettings(settingsPath, { vaultPath });
});

afterEach(async () => {
  await rm(workdir, { recursive: true, force: true });
});

describe("/api/search wiring", () => {
  it("POST /api/notes + PUT body → search finds the Note", async () => {
    const app = createApp({ settingsPath, indexRoot });

    const note = (await (
      await app.request("/api/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    ).json()) as NoteResponse;

    await app.request(`/api/notes/${note.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "# Findable Title\n\nbody mentioning rhinoceros" }),
    });

    const res = await app.request("/api/search?q=rhinoceros");
    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponse;
    expect(body.results).toHaveLength(1);
    const hit = body.results[0]!;
    expect(hit.kind).toBe("note");
    if (hit.kind === "note") expect(hit.noteId).toBe(note.id);
  });

  it("POST /api/capture → search finds the Block", async () => {
    const app = createApp({ settingsPath, indexRoot });

    await app.request("/api/capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "a fleeting thought about pangolins" }),
    });

    const res = await app.request("/api/search?q=pangolins");
    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponse;
    expect(body.results).toHaveLength(1);
    expect(body.results[0]!.kind).toBe("block");
  });

  it("POST /api/index/rebuild reads the on-disk vault and re-populates", async () => {
    // Drop a note and a daily file straight onto disk (skipping the API)
    // to simulate "external edits" that the indexer should pick up.
    await writeFile(
      path.join(vaultPath, "notes", "manual-id.md"),
      "---\nid: manual-id\ncreated: 2026-05-19T00:00:00.000Z\ngeo: {lat: null, lon: null, place: null, accuracy_m: null}\n---\n# Manual Note\n\nManually authored content about quokkas.\n",
    );
    await writeFile(
      path.join(vaultPath, "daily", "2026-05-19.md"),
      "---\ndate: '2026-05-19'\ncreated: '2026-05-19T00:00:00.000Z'\n---\n## 09:14\nmanual capture about narwhals\n",
    );

    const app = createApp({ settingsPath, indexRoot });

    // Pre-rebuild: index hasn't seen any of this yet.
    expect(
      ((await (await app.request("/api/search?q=quokkas")).json()) as SearchResponse)
        .results,
    ).toEqual([]);

    const rebuild = await app.request("/api/index/rebuild", { method: "POST" });
    expect(rebuild.status).toBe(200);
    const counts = (await rebuild.json()) as IndexRebuildResponse;
    expect(counts).toEqual({ notes: 1, daily: 1 });

    expect(
      ((await (await app.request("/api/search?q=quokkas")).json()) as SearchResponse)
        .results,
    ).toHaveLength(1);
    expect(
      ((await (await app.request("/api/search?q=narwhals")).json()) as SearchResponse)
        .results,
    ).toHaveLength(1);
  });
});
