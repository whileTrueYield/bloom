// The composable Hono app for Bloom's HTTP API. Exported as a factory so tests
// can construct fresh instances without sharing state and so the runner in
// `server/index.ts` is the only place that binds it to a port.

import { Hono } from "hono";
import type { HealthResponse } from "@shared/types";

export function createApp(): Hono {
  const app = new Hono();

  app.get("/api/health", (c) => {
    const body: HealthResponse = { ok: true };
    return c.json(body);
  });

  return app;
}
