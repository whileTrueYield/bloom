// Verifies the public health endpoint contract used as the liveness signal by
// the rest of the system. Exercised via Hono's `app.request` to keep the test
// fast and independent of the network layer.

import { describe, it, expect } from "bun:test";
import { createApp } from "@server/app";

describe("server health", () => {
  it("GET /api/health returns ok:true", async () => {
    const app = createApp({ settingsPath: "/tmp/bloom-health-test-settings.json" });
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
