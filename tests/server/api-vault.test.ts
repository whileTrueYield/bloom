// Tests the /api/vault HTTP contract end-to-end through Hono's app.request.
// Each test injects a fresh temp settingsPath so persistence is real but
// isolated.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "@server/app";

let workdir: string;
let settingsPath: string;

beforeEach(async () => {
  workdir = await mkdtemp(path.join(tmpdir(), "bloom-api-vault-"));
  settingsPath = path.join(workdir, "settings.json");
});

afterEach(async () => {
  await rm(workdir, { recursive: true, force: true });
});

describe("POST /api/vault", () => {
  it("returns 400 + structured error for a path that does not exist", async () => {
    const app = createApp({ settingsPath, indexRoot: path.join(workdir, "index") });

    const res = await app.request("/api/vault", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: path.join(workdir, "no-such") }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("PATH_NOT_FOUND");
    expect(typeof body.message).toBe("string");
  });

  it("bootstraps subdirs, persists the choice, and echoes the path on a valid vault", async () => {
    const app = createApp({ settingsPath, indexRoot: path.join(workdir, "index") });
    const vaultPath = path.join(workdir, "vault");
    await mkdir(vaultPath);

    const res = await app.request("/api/vault", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: vaultPath }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { path: string };
    expect(body.path).toBe(vaultPath);

    // Subdirs created by the bootstrap step.
    for (const sub of ["notes", "daily", "attachments"]) {
      const info = await stat(path.join(vaultPath, sub));
      expect(info.isDirectory()).toBe(true);
    }

    // Settings persisted to the temp settings file.
    const settings = JSON.parse(await readFile(settingsPath, "utf8"));
    expect(settings.vaultPath).toBe(vaultPath);
  });
});

describe("GET /api/vault", () => {
  it("returns {path: null} when no vault has been chosen", async () => {
    const app = createApp({ settingsPath, indexRoot: path.join(workdir, "index") });
    const res = await app.request("/api/vault");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ path: null });
  });

  it("returns the persisted path after a successful POST", async () => {
    const app = createApp({ settingsPath, indexRoot: path.join(workdir, "index") });
    const vaultPath = path.join(workdir, "vault");
    await mkdir(vaultPath);

    await app.request("/api/vault", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: vaultPath }),
    });

    const res = await app.request("/api/vault");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ path: vaultPath });
  });
});
