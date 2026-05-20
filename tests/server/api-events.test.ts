// /api/events SSE endpoint. Verifies that an external write to the Vault
// reaches a connected client as an SSE message.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp, type BloomApp } from "@server/app";
import { bootstrapVaultLayout } from "@server/vault";
import { saveSettings } from "@server/settings";

let workdir: string;
let vaultPath: string;
let settingsPath: string;
let activeApps: BloomApp[];

function makeApp(opts: { settingsPath: string }) {
  const app = createApp({ settingsPath: opts.settingsPath, indexRoot: path.join(workdir, "index") });
  activeApps.push(app);
  return app;
}

beforeEach(async () => {
  workdir = await mkdtemp(path.join(tmpdir(), "bloom-api-events-"));
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

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, marker: string, timeoutMs: number): Promise<string> {
  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !buffer.includes(marker)) {
    const remaining = deadline - Date.now();
    const result = await Promise.race([
      reader.read(),
      new Promise<{ value: undefined; done: true }>((r) =>
        setTimeout(() => r({ value: undefined, done: true }), remaining),
      ),
    ]);
    if (result.done) break;
    buffer += decoder.decode(result.value);
  }
  return buffer;
}

describe("GET /api/events", () => {
  it("streams a note:changed event when a Note file appears externally", async () => {
    const app = makeApp({ settingsPath });

    const res = await app.request("/api/events");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);

    const reader = res.body!.getReader();

    // Give the SSE handler time to subscribe to the watcher before we trigger
    // the external write.
    await new Promise((r) => setTimeout(r, 100));

    const id = "20260519T120000000";
    await writeFile(
      path.join(vaultPath, "notes", `${id}.md`),
      "---\nid: 20260519T120000000\n---\n# Outside\n",
    );

    const buffer = await readUntil(reader, id, 2000);
    await reader.cancel();

    expect(buffer).toContain("event: note");
    expect(buffer).toContain(id);
    expect(buffer).toContain("changed");
  });

  it("returns 412 NO_VAULT when no vault is configured", async () => {
    const emptySettingsPath = path.join(workdir, "empty.json");
    await saveSettings(emptySettingsPath, { vaultPath: null });
    const app = makeApp({ settingsPath: emptySettingsPath });

    const res = await app.request("/api/events");
    expect(res.status).toBe(412);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("NO_VAULT");
  });
});
