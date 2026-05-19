// Daily Note module tests. Each test gets a freshly bootstrapped vault in a
// temp directory and an injectable clock so we can assert exact filenames and
// heading times without depending on wall-clock timing.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import matter from "gray-matter";
import { bootstrapVaultLayout } from "@server/vault";
import { appendBlock } from "@server/dailyNote";

let vaultPath: string;

beforeEach(async () => {
  vaultPath = await mkdtemp(path.join(tmpdir(), "bloom-daily-"));
  await bootstrapVaultLayout(vaultPath);
});

afterEach(async () => {
  await rm(vaultPath, { recursive: true, force: true });
});

describe("appendBlock", () => {
  it("creates today's Daily Note with frontmatter and a time-only block", async () => {
    const now = new Date("2026-05-19T14:45:00");   // local time
    const result = await appendBlock(vaultPath, { text: "first thought", now });

    expect(result.date).toBe("2026-05-19");
    expect(result.path).toBe(path.join(vaultPath, "daily", "2026-05-19.md"));

    const raw = await readFile(result.path, "utf8");
    const parsed = matter(raw);

    expect(parsed.data).toEqual({
      date: "2026-05-19",
      created: expect.any(String) as unknown as string,
    });

    // First block: time-only heading, body, no leading separator.
    expect(parsed.content).toContain("## 14:45\nfirst thought");
  });

  it("includes lat, lon, and accuracy in the heading when geo is provided", async () => {
    const now = new Date("2026-05-19T10:32:00");
    const result = await appendBlock(vaultPath, {
      text: "with geo",
      geo: { lat: 48.8541, lon: 2.3331, accuracy_m: 80 },
      now,
    });

    const raw = await readFile(result.path, "utf8");
    expect(raw).toContain("## 10:32 (48.8541, 2.3331 ±80m)");
  });

  it("appends subsequent blocks the same day separated by ---", async () => {
    const first = new Date("2026-05-19T09:14:00");
    const second = new Date("2026-05-19T10:32:00");

    await appendBlock(vaultPath, { text: "first thought", now: first });
    const result = await appendBlock(vaultPath, { text: "second thought", now: second });

    const raw = await readFile(result.path, "utf8");
    const parsed = matter(raw);

    // Both blocks present, separated by ---, original creation timestamp preserved.
    expect(parsed.content).toContain("## 09:14\nfirst thought");
    expect(parsed.content).toContain("## 10:32\nsecond thought");
    expect(parsed.content).toMatch(/first thought[\s\S]*\n---\n[\s\S]*second thought/);

    // Frontmatter created stays at the moment of first capture, not the second.
    expect(parsed.data.created).toBe(first.toISOString());
  });
});
