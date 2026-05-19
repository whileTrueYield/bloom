// Runner that binds the composed Hono app to a port. Builds the production
// settings path here so `createApp` itself stays platform-agnostic and tests
// can construct it against a temp file.

import os from "node:os";
import path from "node:path";
import { createApp } from "./app";

const settingsPath = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "Bloom",
  "settings.json",
);

const app = createApp({ settingsPath });
const port = Number(process.env.PORT ?? 3000);

console.log(`Bloom server listening on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
