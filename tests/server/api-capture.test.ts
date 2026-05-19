// End-to-end /api/capture tests. Each test gets a freshly bootstrapped vault
// configured as the active vault via settings, so the requireVault middleware
// passes and handlers exercise the real Daily Note module.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "@server/app";
import { bootstrapVaultLayout } from "@server/vault";
import { saveSettings } from "@server/settings";

let workdir: string;
let vaultPath: string;
let settingsPath: string;

beforeEach(async () => {
  workdir = await mkdtemp(path.join(tmpdir(), "bloom-api-capture-"));
  vaultPath = path.join(workdir, "vault");
  settingsPath = path.join(workdir, "settings.json");
  await mkdir(vaultPath);
  await bootstrapVaultLayout(vaultPath);
  await saveSettings(settingsPath, { vaultPath });
});

afterEach(async () => {
  await rm(workdir, { recursive: true, force: true });
});

describe("POST /api/capture", () => {
  it("creates today's Daily Note and appends a Block with the captured text", async () => {
    const app = createApp({ settingsPath });

    const res = await app.request("/api/capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "fleeting thought from a test" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { date: string; path: string };
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.path).toContain(`daily/${body.date}.md`);

    const onDisk = await readFile(body.path, "utf8");
    expect(onDisk).toContain("fleeting thought from a test");
  });

  it("writes geo coordinates into the heading when geo is provided", async () => {
    const app = createApp({ settingsPath });

    const res = await app.request("/api/capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: "captured at the cafe",
        geo: { lat: 48.8541, lon: 2.3331, accuracy_m: 80 },
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { path: string };

    const onDisk = await readFile(body.path, "utf8");
    expect(onDisk).toMatch(/## \d{2}:\d{2} \(48\.8541, 2\.3331 ±80m\)\ncaptured at the cafe/);
  });

  it("returns 412 NO_VAULT when no vault is configured", async () => {
    const emptySettingsPath = path.join(workdir, "empty-settings.json");
    await saveSettings(emptySettingsPath, { vaultPath: null });
    const app = createApp({ settingsPath: emptySettingsPath });

    const res = await app.request("/api/capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "blocked" }),
    });
    expect(res.status).toBe(412);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("NO_VAULT");
  });
});
