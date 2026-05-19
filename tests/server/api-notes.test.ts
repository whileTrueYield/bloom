// End-to-end /api/notes tests. Each test gets a freshly bootstrapped vault
// and a settings file pointing at it, so the requireVault middleware sees a
// configured state and the handlers exercise the real Vault module.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "@server/app";
import { bootstrapVaultLayout } from "@server/vault";
import { saveSettings } from "@server/settings";
import type { NoteResponse, NotesListResponse } from "@shared/types";

let workdir: string;
let vaultPath: string;
let settingsPath: string;

beforeEach(async () => {
  workdir = await mkdtemp(path.join(tmpdir(), "bloom-api-notes-"));
  vaultPath = path.join(workdir, "vault");
  settingsPath = path.join(workdir, "settings.json");
  await mkdir(vaultPath);
  await bootstrapVaultLayout(vaultPath);
  await saveSettings(settingsPath, { vaultPath });
});

afterEach(async () => {
  await rm(workdir, { recursive: true, force: true });
});

describe("POST /api/notes", () => {
  it("creates a new Note and returns its full state", async () => {
    const app = createApp({ settingsPath, indexRoot: path.join(workdir, "index") });

    const res = await app.request("/api/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as NoteResponse;
    expect(body.id).toMatch(/^\d{8}T\d{9}$/);
    expect(body.body).toBe("");
    expect(body.frontmatter.id).toBe(body.id);
    expect(body.frontmatter.geo).toEqual({
      lat: null,
      lon: null,
      place: null,
      accuracy_m: null,
    });
  });
});

describe("GET /api/notes/:id", () => {
  it("returns a previously created Note", async () => {
    const app = createApp({ settingsPath, indexRoot: path.join(workdir, "index") });

    const created = (await (
      await app.request("/api/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    ).json()) as NoteResponse;

    const res = await app.request(`/api/notes/${created.id}`);
    expect(res.status).toBe(200);
    const fetched = (await res.json()) as NoteResponse;
    expect(fetched.id).toBe(created.id);
    expect(fetched.body).toBe(created.body);
    expect(fetched.frontmatter).toEqual(created.frontmatter);
  });

  it("returns 404 for an unknown id", async () => {
    const app = createApp({ settingsPath, indexRoot: path.join(workdir, "index") });
    const res = await app.request("/api/notes/20990101T000000000");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("NOTE_NOT_FOUND");
  });
});

describe("PUT /api/notes/:id", () => {
  it("updates the body and preserves the frontmatter", async () => {
    const app = createApp({ settingsPath, indexRoot: path.join(workdir, "index") });

    const created = (await (
      await app.request("/api/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    ).json()) as NoteResponse;

    const res = await app.request(`/api/notes/${created.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "# Title\n\nNew body text." }),
    });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as NoteResponse;
    expect(updated.body).toBe("# Title\n\nNew body text.");
    expect(updated.frontmatter).toEqual(created.frontmatter);

    const reread = (await (await app.request(`/api/notes/${created.id}`)).json()) as NoteResponse;
    expect(reread.body).toBe("# Title\n\nNew body text.");
  });
});

describe("GET /api/notes", () => {
  it("returns an empty list when the vault has no notes", async () => {
    const app = createApp({ settingsPath, indexRoot: path.join(workdir, "index") });
    const res = await app.request("/api/notes");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ notes: [] });
  });

  it("returns the created Notes sorted by modified desc", async () => {
    const app = createApp({ settingsPath, indexRoot: path.join(workdir, "index") });

    const post = () =>
      app.request("/api/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });

    const a = (await (await post()).json()) as NoteResponse;
    await new Promise((r) => setTimeout(r, 5));
    const b = (await (await post()).json()) as NoteResponse;
    await new Promise((r) => setTimeout(r, 5));
    const c = (await (await post()).json()) as NoteResponse;

    const res = await app.request("/api/notes");
    expect(res.status).toBe(200);
    const list = (await res.json()) as NotesListResponse;
    expect(list.notes.map((n) => n.id)).toEqual([c.id, b.id, a.id]);
  });
});

describe("requireVault middleware", () => {
  it("returns 412 NO_VAULT for /api/notes routes when no vault is configured", async () => {
    // Override the per-test settings with an empty settings file.
    const emptySettingsPath = path.join(workdir, "empty-settings.json");
    await saveSettings(emptySettingsPath, { vaultPath: null });
    const app = createApp({ settingsPath: emptySettingsPath, indexRoot: path.join(workdir, "index") });

    for (const url of ["/api/notes", "/api/notes/20990101T000000000"]) {
      const res = await app.request(url);
      expect(res.status).toBe(412);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("NO_VAULT");
    }
  });
});
