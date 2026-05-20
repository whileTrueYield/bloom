// End-to-end tests for /api/index endpoints. /rebuild is already exercised
// through indexer.test.ts; here we focus on /stats — the diagnostics surface
// the Settings page reads to show "you have N Notes and M Blocks on disk".

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp, type BloomApp } from "@server/app";
import { bootstrapVaultLayout } from "@server/vault";
import { saveSettings } from "@server/settings";

let workdir: string;
let vaultPath: string;
let settingsPath: string;
let activeApps: BloomApp[];

function makeApp(settingsArg = settingsPath) {
  const app = createApp({
    settingsPath: settingsArg,
    indexRoot: path.join(workdir, "index"),
  });
  activeApps.push(app);
  return app;
}

beforeEach(async () => {
  workdir = await mkdtemp(path.join(tmpdir(), "bloom-api-index-"));
  vaultPath = path.join(workdir, "vault");
  settingsPath = path.join(workdir, "settings.json");
  activeApps = [];
  await mkdir(vaultPath);
  await bootstrapVaultLayout(vaultPath);
  await saveSettings(settingsPath, { vaultPath });
});

afterEach(async () => {
  for (const app of activeApps) await app.shutdown();
  await rm(workdir, { recursive: true, force: true });
});

describe("GET /api/index/stats", () => {
  it("reports counts of Notes, Blocks, Wikilinks, and the index file size", async () => {
    const app = makeApp();

    // Two Notes, one of which links to the other.
    const n1 = await app.request("/api/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const { id: n1Id } = (await n1.json()) as { id: string };
    await app.request(`/api/notes/${n1Id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "# Target note" }),
    });

    const n2 = await app.request("/api/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const { id: n2Id } = (await n2.json()) as { id: string };
    await app.request(`/api/notes/${n2Id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "# Source\nlinks to [[Target note]]" }),
    });

    // Two Captures land two Blocks in today's Daily Note.
    await app.request("/api/capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "first" }),
    });
    await app.request("/api/capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "second [[Target note]]" }),
    });

    const res = await app.request("/api/index/stats");
    expect(res.status).toBe(200);
    const stats = (await res.json()) as {
      notes: number;
      daily: number;
      blocks: number;
      wikilinks: number;
      sizeBytes: number;
    };
    expect(stats.notes).toBe(2);
    expect(stats.daily).toBe(1);
    expect(stats.blocks).toBe(2);
    // Two [[Target note]] references — one from a Note, one from a Block.
    expect(stats.wikilinks).toBe(2);
    expect(stats.sizeBytes).toBeGreaterThan(0);
  });

  it("returns 412 NO_VAULT when no vault is configured", async () => {
    const emptySettingsPath = path.join(workdir, "empty-settings.json");
    await saveSettings(emptySettingsPath, { vaultPath: null });
    const app = makeApp(emptySettingsPath);

    const res = await app.request("/api/index/stats");
    expect(res.status).toBe(412);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("NO_VAULT");
  });
});
