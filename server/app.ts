// The composable Hono app for Bloom's HTTP API. Exported as a factory so tests
// can construct fresh instances without sharing state and so the runner in
// `server/index.ts` is the only place that binds it to a port.

import { Hono } from "hono";
import type {
  ApiError,
  HealthResponse,
  VaultResponse,
  VaultSetRequest,
} from "@shared/types";
import { bootstrapVaultLayout, validateVaultPath } from "./vault";
import { loadSettings, saveSettings } from "./settings";

export interface AppDeps {
  // Absolute path to the JSON settings file. Production uses
  // ~/Library/Application Support/Bloom/settings.json; tests use a temp path.
  settingsPath: string;
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

  return app;
}
