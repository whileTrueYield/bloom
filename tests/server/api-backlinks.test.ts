// End-to-end /api/notes/:id/backlinks tests. Builds a real Vault + Indexer
// so the link table is populated through the normal save pipeline.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp, type BloomApp } from "@server/app";
import { bootstrapVaultLayout, createNote, saveNote } from "@server/vault";
import { saveSettings } from "@server/settings";
import type { BacklinksResponse } from "@shared/types";

let workdir: string;
let vaultPath: string;
let settingsPath: string;
let activeApps: BloomApp[];

function makeApp(settingsArg = settingsPath) {
  const app = createApp({ settingsPath: settingsArg, indexRoot: path.join(workdir, "index") });
  activeApps.push(app);
  return app;
}

beforeEach(async () => {
  workdir = await mkdtemp(path.join(tmpdir(), "bloom-api-backlinks-"));
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

describe("GET /api/notes/:id/backlinks", () => {
  it("returns the sources that link to the target Note's title, populated by the save pipeline", async () => {
    const app = makeApp();

    // Target.
    const targetRes = await app.request("/api/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const target = (await targetRes.json()) as { id: string };
    await app.request(`/api/notes/${target.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "# Alpha\n\nTarget body." }),
    });

    // Source — links to Alpha.
    const sourceRes = await app.request("/api/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const source = (await sourceRes.json()) as { id: string };
    await app.request(`/api/notes/${source.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        body: "# Source\n\nA paragraph referencing [[Alpha]] in the text.",
      }),
    });

    const res = await app.request(`/api/notes/${target.id}/backlinks`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as BacklinksResponse;
    expect(body.backlinks).toHaveLength(1);
    const hit = body.backlinks[0]!;
    expect(hit.kind).toBe("note");
    if (hit.kind === "note") {
      expect(hit.noteId).toBe(source.id);
      expect(hit.title).toBe("Source");
      expect(hit.snippet).toContain("Alpha");
    }
  });

  it("returns 412 NO_VAULT when no vault is configured", async () => {
    const emptySettingsPath = path.join(workdir, "empty.json");
    await saveSettings(emptySettingsPath, { vaultPath: null });
    const app = makeApp(emptySettingsPath);

    const res = await app.request("/api/notes/anyid/backlinks");
    expect(res.status).toBe(412);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("NO_VAULT");
  });
});
