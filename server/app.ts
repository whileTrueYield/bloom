// The composable Hono app for Bloom's HTTP API. Exported as a factory so tests
// can construct fresh instances without sharing state and so the runner in
// `server/index.ts` is the only place that binds it to a port.

import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type {
  ApiError,
  CaptureRequest,
  CaptureResponse,
  CreateNoteRequest,
  HealthResponse,
  NoteResponse,
  NotesListResponse,
  UpdateNoteRequest,
  VaultResponse,
  VaultSetRequest,
  WikilinkResolveResponse,
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
import { resolveWikilink } from "./wikilink";
import { loadSettings, saveSettings } from "./settings";

export interface AppDeps {
  // Absolute path to the JSON settings file. Production uses
  // ~/Library/Application Support/Bloom/settings.json; tests use a temp path.
  settingsPath: string;
}

// Note routes refuse to run when no Vault is configured. The middleware loads
// settings on each request (cheap, ~kilobyte JSON) and exposes the resolved
// vault path to handlers via c.var.vaultPath.
type RequireVaultEnv = { Variables: { vaultPath: string } };

function requireVault(deps: AppDeps) {
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
    await next();
  });
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

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
  notesRouter.use("*", requireVault(deps));

  notesRouter.get("/", async (c) => {
    const notes = await listNotes(c.var.vaultPath);
    const body: NotesListResponse = { notes };
    return c.json(body);
  });

  notesRouter.post("/", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as CreateNoteRequest;
    const note = await createNote(c.var.vaultPath, { geo: body.geo });
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
  captureRouter.use("*", requireVault(deps));

  captureRouter.post("/", async (c) => {
    const body = (await c.req.json()) as CaptureRequest;
    const result = await appendBlock(c.var.vaultPath, {
      text: body.text,
      geo: body.geo,
    });
    const response: CaptureResponse = { date: result.date, path: result.path };
    return c.json(response, 201);
  });

  app.route("/api/capture", captureRouter);

  const wikilinkRouter = new Hono<RequireVaultEnv>();
  wikilinkRouter.use("*", requireVault(deps));

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

  app.route("/api/wikilink", wikilinkRouter);

  return app;
}
