// Shared response shapes used by both the Bun/Hono server and the React
// client. Lives at the workspace root so the same source of truth is imported
// on both sides via the `@shared/*` path alias.

export interface HealthResponse {
  ok: boolean;
}
