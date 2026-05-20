// Runner that binds the composed Hono app to a port. Builds the production
// settings path here so `createApp` itself stays platform-agnostic and tests
// can construct it against a temp file.
//
// `bun --hot` re-evaluates this module on every save, but the previous
// process is not torn down. To avoid leaking a second Indexer / Watcher per
// reload (which manifests as SQLITE_BUSY when two connections race for a
// write lock), the BloomApp is cached on globalThis and the prior one is
// shut down explicitly before a fresh one is created.

import os from "node:os";
import path from "node:path";
import { createApp, type BloomApp } from "./app";

const appSupport = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "Bloom",
);
const settingsPath = path.join(appSupport, "settings.json");
const indexRoot = path.join(appSupport, "index");

const globalKey = Symbol.for("bloom.runner.app");
type RunnerGlobals = { [k: symbol]: BloomApp | undefined };
const globals = globalThis as unknown as RunnerGlobals;

const previous = globals[globalKey];
if (previous) {
  void previous.shutdown();
}

const app = createApp({ settingsPath, indexRoot });
globals[globalKey] = app;

const port = Number(process.env.PORT ?? 3000);

console.log(`Bloom server listening on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
  // SSE connections idle (no bytes flowing) between Vault events. Disable
  // Bun's default 10s idleTimeout so EventSource subscribers stay connected.
  idleTimeout: 0,
};
