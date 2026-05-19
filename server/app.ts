// The composable Hono app for Bloom's HTTP API. Exported as a factory so tests
// can construct fresh instances without sharing state and so the runner in
// `server/index.ts` is the only place that binds it to a port.

import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { createHash } from "node:crypto";
import path from "node:path";
import type {
  ApiError,
  CaptureRequest,
  CaptureResponse,
  CreateNoteRequest,
  HealthResponse,
  IndexRebuildResponse,
  NoteResponse,
  NotesListResponse,
  SearchResponse,
  UpdateNoteRequest,
  VaultResponse,
  VaultSetRequest,
  WikilinkResolveResponse,
  WikilinkSuggestResponse,
} from "@shared/types";
import {
  bootstrapVaultLayout,
  createNote,
  listNotes,
  loadNote,
  saveNote,
  validateVaultPath,
} from "./vault";
import { appendBlock } from "./dailyNote";
import { resolveWikilink, suggestWikilinks } from "./wikilink";
import { loadSettings, saveSettings } from "./settings";
import { createIndexer, type Indexer } from "./indexer";

export interface AppDeps {
  // Absolute path to the JSON settings file. Production uses
  // ~/Library/Application Support/Bloom/settings.json; tests use a temp path.
  settingsPath: string;
  // Root directory under which per-vault index databases are stored
  // (`<indexRoot>/<vaultHash>/index.sqlite`). Production matches the settings
  // path's parent dir; tests pass a temp path for full isolation.
  indexRoot: string;
}

function vaultHash(vaultPath: string): string {
  return createHash("sha256").update(vaultPath).digest("hex").slice(0, 16);
}

// Note routes refuse to run when no Vault is configured. The middleware loads
// settings on each request (cheap, ~kilobyte JSON) and exposes the resolved
// vault path to handlers via c.var.vaultPath.
type RequireVaultEnv = {
  Variables: { vaultPath: string; indexer: Indexer };
};

function requireVault(deps: AppDeps, getIndexer: (vaultPath: string) => Indexer) {
  return createMiddleware<RequireVaultEnv>(async (c, next) => {
    const settings = await loadSettings(deps.settingsPath);
    if (!settings.vaultPath) {
      const err: ApiError = {
        error: "NO_VAULT",
        message: "No vault is configured. Set one via POST /api/vault.",
      };
      return c.json(err, 412);
    }
    c.set("vaultPath", settings.vaultPath);
    c.set("indexer", getIndexer(settings.vaultPath));
    await next();
  });
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  // Per-vault Indexer cache. Keyed by vaultPath so that POSTing a new vault
  // automatically gets a fresh indexer; the previous one is still reachable
  // via its old vaultPath key if it ever matters (e.g., during migrations).
  const indexerCache = new Map<string, Indexer>();
  function getIndexer(vaultPath: string): Indexer {
    let cached = indexerCache.get(vaultPath);
    if (!cached) {
      const dbPath = path.join(deps.indexRoot, vaultHash(vaultPath), "index.sqlite");
      cached = createIndexer({ dbPath, vaultPath });
      indexerCache.set(vaultPath, cached);
    }
    return cached;
  }

  app.get("/api/health", (c) => {
    const body: HealthResponse = { ok: true };
    return c.json(body);
  });

  app.get("/api/vault", async (c) => {
    const settings = await loadSettings(deps.settingsPath);
    const body: VaultResponse = { path: settings.vaultPath };
    return c.json(body);
  });

  app.post("/api/vault", async (c) => {
    const body = (await c.req.json()) as VaultSetRequest;
    const validation = await validateVaultPath(body.path);

    if (!validation.ok) {
      const err: ApiError = { error: validation.error, message: validation.message };
      return c.json(err, 400);
    }

    await bootstrapVaultLayout(validation.path);
    await saveSettings(deps.settingsPath, { vaultPath: validation.path });

    const ok: VaultResponse = { path: validation.path };
    return c.json(ok);
  });

  const notesRouter = new Hono<RequireVaultEnv>();
  notesRouter.use("*", requireVault(deps, getIndexer));

  notesRouter.get("/", async (c) => {
    const notes = await listNotes(c.var.vaultPath);
    const body: NotesListResponse = { notes };
    return c.json(body);
  });

  notesRouter.post("/", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as CreateNoteRequest;
    const note = await createNote(c.var.vaultPath, { geo: body.geo });
    await c.var.indexer.indexNote(note.id);
    return c.json(note as NoteResponse, 201);
  });

  notesRouter.get("/:id", async (c) => {
    const id = c.req.param("id");
    try {
      const note = await loadNote(c.var.vaultPath, id);
      return c.json(note as NoteResponse);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        const e: ApiError = { error: "NOTE_NOT_FOUND", message: `No Note with id ${id}` };
        return c.json(e, 404);
      }
      throw err;
    }
  });

  notesRouter.put("/:id", async (c) => {
    const id = c.req.param("id");
    const { body } = (await c.req.json()) as UpdateNoteRequest;
    try {
      const note = await saveNote(c.var.vaultPath, id, body);
      await c.var.indexer.indexNote(note.id);
      return c.json(note as NoteResponse);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        const e: ApiError = { error: "NOTE_NOT_FOUND", message: `No Note with id ${id}` };
        return c.json(e, 404);
      }
      throw err;
    }
  });

  app.route("/api/notes", notesRouter);

  const captureRouter = new Hono<RequireVaultEnv>();
  captureRouter.use("*", requireVault(deps, getIndexer));

  captureRouter.post("/", async (c) => {
    const body = (await c.req.json()) as CaptureRequest;
    const result = await appendBlock(c.var.vaultPath, {
      text: body.text,
      geo: body.geo,
    });
    await c.var.indexer.indexDailyNote(result.date);
    const response: CaptureResponse = { date: result.date, path: result.path };
    return c.json(response, 201);
  });

  app.route("/api/capture", captureRouter);

  const wikilinkRouter = new Hono<RequireVaultEnv>();
  wikilinkRouter.use("*", requireVault(deps, getIndexer));

  wikilinkRouter.get("/resolve", async (c) => {
    const text = c.req.query("text");
    if (!text) {
      const err: ApiError = {
        error: "MISSING_TEXT",
        message: "Wikilink resolution requires ?text=<linkText>.",
      };
      return c.json(err, 400);
    }
    const id = await resolveWikilink(c.var.vaultPath, text);
    const body: WikilinkResolveResponse = { id };
    return c.json(body);
  });

  wikilinkRouter.get("/suggest", async (c) => {
    const q = c.req.query("q") ?? "";
    const suggestions = q
      ? await suggestWikilinks(c.var.vaultPath, q)
      : [];
    const body: WikilinkSuggestResponse = { suggestions };
    return c.json(body);
  });

  app.route("/api/wikilink", wikilinkRouter);

  const searchRouter = new Hono<RequireVaultEnv>();
  searchRouter.use("*", requireVault(deps, getIndexer));

  searchRouter.get("/", (c) => {
    const q = c.req.query("q") ?? "";
    const limit = Number(c.req.query("limit") ?? 20);
    const results = q ? c.var.indexer.search(q, limit) : [];
    const body: SearchResponse = { results };
    return c.json(body);
  });

  app.route("/api/search", searchRouter);

  const indexRouter = new Hono<RequireVaultEnv>();
  indexRouter.use("*", requireVault(deps, getIndexer));

  indexRouter.post("/rebuild", async (c) => {
    const counts = await c.var.indexer.rebuild();
    const body: IndexRebuildResponse = counts;
    return c.json(body);
  });

  app.route("/api/index", indexRouter);

  return app;
}
