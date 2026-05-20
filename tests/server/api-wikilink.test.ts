// End-to-end /api/wikilink/resolve tests against a real Vault populated
// with real Notes whose H1s drive the resolver.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp, type BloomApp } from "@server/app";
import { bootstrapVaultLayout, createNote, saveNote } from "@server/vault";
import { saveSettings } from "@server/settings";

let workdir: string;
let vaultPath: string;
let settingsPath: string;
let activeApps: BloomApp[];

function makeApp() {
  const app = createApp({ settingsPath, indexRoot: path.join(workdir, "index") });
  activeApps.push(app);
  return app;
}

beforeEach(async () => {
  workdir = await mkdtemp(path.join(tmpdir(), "bloom-api-wikilink-"));
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

describe("GET /api/wikilink/resolve", () => {
  it("returns the id of a Note whose H1 matches the link text", async () => {
    const note = await createNote(vaultPath);
    await saveNote(vaultPath, note.id, "# Zettelkasten as thinking tool\n\nbody");

    const app = makeApp();
    const res = await app.request(
      `/api/wikilink/resolve?text=${encodeURIComponent("Zettelkasten as thinking tool")}`,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string | null };
    expect(body.id).toBe(note.id);
  });

  it("returns {id: null} when no Note's H1 matches", async () => {
    const app = makeApp();
    const res = await app.request("/api/wikilink/resolve?text=NoSuchTitle");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: null });
  });
});

describe("GET /api/wikilink/suggest", () => {
  it("returns suggestions ranked by tier and capped at limit", async () => {
    const a = await createNote(vaultPath);
    await saveNote(vaultPath, a.id, "# zenith of thought\n\nbody");
    const b = await createNote(vaultPath);
    await saveNote(vaultPath, b.id, "# practical zen\n\nbody");

    const app = makeApp();
    const res = await app.request("/api/wikilink/suggest?q=zen");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      suggestions: Array<{ id: string; title: string; tier: number }>;
    };
    expect(body.suggestions.map((s) => s.title)).toEqual([
      "zenith of thought", // tier 1 (prefix)
      "practical zen",     // tier 2 (substring)
    ]);
  });

  it("returns an empty suggestions array for an empty query", async () => {
    const app = makeApp();
    const res = await app.request("/api/wikilink/suggest?q=");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ suggestions: [] });
  });
});
