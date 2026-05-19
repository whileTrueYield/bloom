// Settings persistence tests. Each test uses a fresh temp file so we can
// observe real disk round-trips without contaminating any user-level settings.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadSettings, saveSettings } from "@server/settings";

let workdir: string;
let settingsPath: string;

beforeEach(async () => {
  workdir = await mkdtemp(path.join(tmpdir(), "bloom-settings-"));
  settingsPath = path.join(workdir, "settings.json");
});

afterEach(async () => {
  await rm(workdir, { recursive: true, force: true });
});

describe("settings", () => {
  it("round-trips: save then load returns the saved value", async () => {
    await saveSettings(settingsPath, { vaultPath: "/some/path" });
    const loaded = await loadSettings(settingsPath);
    expect(loaded.vaultPath).toBe("/some/path");
  });

  it("returns defaults when the file does not exist", async () => {
    const loaded = await loadSettings(settingsPath);
    expect(loaded.vaultPath).toBeNull();
  });
});
