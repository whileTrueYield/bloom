// Vault module tests. Exercises the public interface against the real
// filesystem through a freshly-minted temp directory per test so behavior is
// observable end-to-end (no fs mocking — the Vault module's whole job IS the
// filesystem).

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { stat } from "node:fs/promises";
import { bootstrapVaultLayout, validateVaultPath } from "@server/vault";

let workdir: string;

beforeEach(async () => {
  workdir = await mkdtemp(path.join(tmpdir(), "bloom-vault-"));
});

afterEach(async () => {
  await rm(workdir, { recursive: true, force: true });
});

describe("validateVaultPath", () => {
  it("rejects a path that does not exist", async () => {
    const ghost = path.join(workdir, "no-such-dir");
    const result = await validateVaultPath(ghost);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("PATH_NOT_FOUND");
  });

  it("rejects a path that is a file, not a directory", async () => {
    const file = path.join(workdir, "not-a-dir.txt");
    await writeFile(file, "");
    const result = await validateVaultPath(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("PATH_NOT_DIRECTORY");
  });

  it("accepts an existing directory", async () => {
    const result = await validateVaultPath(workdir);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.path).toBe(workdir);
  });
});

describe("bootstrapVaultLayout", () => {
  it("creates notes/, daily/, and attachments/ and is idempotent", async () => {
    await bootstrapVaultLayout(workdir);
    for (const sub of ["notes", "daily", "attachments"]) {
      const info = await stat(path.join(workdir, sub));
      expect(info.isDirectory()).toBe(true);
    }

    // Second run must not throw — bootstrap is safe to call repeatedly.
    await bootstrapVaultLayout(workdir);
    for (const sub of ["notes", "daily", "attachments"]) {
      const info = await stat(path.join(workdir, sub));
      expect(info.isDirectory()).toBe(true);
    }
  });
});
