// Runner that binds the composed Hono app to a port. Kept tiny so the app
// itself stays trivially testable in isolation without spinning up a listener.

import { createApp } from "./app";

const app = createApp();
const port = Number(process.env.PORT ?? 3000);

console.log(`Bloom server listening on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
