// End-to-end /api/daily tests. The Daily Notes API gives the sidebar a way to
// list dated notes and the Workspace a way to load/save them. Each test gets a
// freshly bootstrapped vault wired up as the active vault.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp, type BloomApp } from "@server/app";
import { bootstrapVaultLayout } from "@server/vault";
import { appendBlock } from "@server/dailyNote";
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
  workdir = await mkdtemp(path.join(tmpdir(), "bloom-api-daily-"));
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

describe("GET /api/daily", () => {
  it("returns existing Daily Note dates sorted descending", async () => {
    await appendBlock(vaultPath, {
      text: "older",
      now: new Date("2026-05-18T09:00:00"),
    });
    await appendBlock(vaultPath, {
      text: "middle",
      now: new Date("2026-05-19T09:00:00"),
    });
    await appendBlock(vaultPath, {
      text: "newest",
      now: new Date("2026-05-20T09:00:00"),
    });

    const app = makeApp();
    const res = await app.request("/api/daily");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { daily: { date: string }[] };
    expect(body.daily.map((d) => d.date)).toEqual([
      "2026-05-20",
      "2026-05-19",
      "2026-05-18",
    ]);
  });

  it("returns an empty list when the vault has no Daily Notes", async () => {
    const app = makeApp();
    const res = await app.request("/api/daily");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { daily: { date: string }[] };
    expect(body.daily).toEqual([]);
  });
});

describe("GET /api/daily/:date", () => {
  it("returns the body and path of an existing Daily Note", async () => {
    const { path: filePath } = await appendBlock(vaultPath, {
      text: "morning thought",
      now: new Date("2026-05-20T09:14:00"),
    });

    const app = makeApp();
    const res = await app.request("/api/daily/2026-05-20");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      date: string;
      path: string;
      body: string;
      modified: string;
    };
    expect(body.date).toBe("2026-05-20");
    expect(body.path).toBe(filePath);
    expect(body.body).toContain("## 09:14\nmorning thought");
    expect(body.modified).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns 404 when no Daily Note exists for that date", async () => {
    const app = makeApp();
    const res = await app.request("/api/daily/2026-01-01");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("DAILY_NOT_FOUND");
  });

  it("rejects malformed dates with 400", async () => {
    const app = makeApp();
    const res = await app.request("/api/daily/not-a-date");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("BAD_DATE");
  });
});

describe("PUT /api/daily/:date", () => {
  it("persists an edited Daily Note body and reindexes it", async () => {
    const app = makeApp();

    // Capture sets up today's Daily Note via the real flow so the indexer
    // has rows to invalidate.
    const cap = await app.request("/api/capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "tpyo here" }),
    });
    expect(cap.status).toBe(201);
    const { date } = (await cap.json()) as { date: string };

    // Search confirms the original body is indexed.
    const before = await app.request("/api/search?q=tpyo");
    const beforeBody = (await before.json()) as {
      results: { kind: string; snippet: string }[];
    };
    expect(beforeBody.results.some((r) => r.snippet.includes("tpyo"))).toBe(
      true,
    );

    const updated = "## 09:14\ntypo fixed\n";
    const put = await app.request(`/api/daily/${date}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: updated }),
    });
    expect(put.status).toBe(200);
    const putBody = (await put.json()) as { body: string };
    expect(putBody.body).toContain("typo fixed");

    // The on-disk file reflects the new content and keeps the frontmatter.
    const onDisk = await readFile(
      path.join(vaultPath, "daily", `${date}.md`),
      "utf8",
    );
    expect(onDisk).toContain(`date: '${date}'`);
    expect(onDisk).toContain("typo fixed");
    expect(onDisk).not.toContain("tpyo here");

    // And the index reflects it: the old text is gone, the new text is found.
    const afterOld = await app.request("/api/search?q=tpyo");
    const afterOldBody = (await afterOld.json()) as { results: unknown[] };
    expect(afterOldBody.results).toEqual([]);

    const afterNew = await app.request("/api/search?q=typo");
    const afterNewBody = (await afterNew.json()) as {
      results: { snippet: string }[];
    };
    expect(afterNewBody.results.some((r) => r.snippet.includes("typo"))).toBe(
      true,
    );
  });
});

describe("POST /api/daily/today", () => {
  it("returns today's date and creates an empty Daily Note if missing", async () => {
    const app = makeApp();

    const res = await app.request("/api/daily/today", { method: "POST" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { date: string };
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // The file is on disk and contains the expected frontmatter, no Blocks.
    const onDisk = await readFile(
      path.join(vaultPath, "daily", `${body.date}.md`),
      "utf8",
    );
    expect(onDisk).toContain(`date: '${body.date}'`);
  });

  it("is idempotent — does not clobber an existing Daily Note", async () => {
    const app = makeApp();

    const cap = await app.request("/api/capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "morning thought" }),
    });
    const { date, path: capPath } = (await cap.json()) as {
      date: string;
      path: string;
    };
    const beforeBytes = await readFile(capPath, "utf8");

    const res = await app.request("/api/daily/today", { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { date: string };
    expect(body.date).toBe(date);

    const afterBytes = await readFile(capPath, "utf8");
    expect(afterBytes).toBe(beforeBytes);
  });
});

describe("/api/daily without a configured vault", () => {
  it("returns 412 NO_VAULT for list, load, and save", async () => {
    const emptySettingsPath = path.join(workdir, "empty-settings.json");
    await saveSettings(emptySettingsPath, { vaultPath: null });
    const app = makeApp(emptySettingsPath);

    for (const req of [
      app.request("/api/daily"),
      app.request("/api/daily/2026-05-20"),
      app.request("/api/daily/2026-05-20", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: "x" }),
      }),
    ]) {
      const res = await req;
      expect(res.status).toBe(412);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("NO_VAULT");
    }
  });
});
