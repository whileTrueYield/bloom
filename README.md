# Bloom

A local-first second brain in the Zettelkasten tradition. Geo-stamped capture,
plain-markdown vault, local Ollama for AI surfaces.

See [`CONTEXT.md`](./CONTEXT.md) for the domain glossary and
[`docs/adr/`](./docs/adr/) for the architectural decisions behind every
load-bearing choice.

## Development

Requires [Bun](https://bun.sh) 1.3+ and Node 20+.

```bash
bun install
bun run dev
```

This starts both:

- The Bun + Hono API server at `http://localhost:3000`
- The Vite dev server (React + Redux Toolkit UI) at `http://localhost:5173`

The Vite dev server proxies `/api/*` to the Bun server, so the client talks to
a single origin and CORS never enters the picture.

## Scripts

| Script                  | Purpose                                       |
| ----------------------- | --------------------------------------------- |
| `bun run dev`           | Run both server and client in dev mode        |
| `bun run dev:server`    | Bun server only (with hot reload)             |
| `bun run dev:client`    | Vite client only                              |
| `bun run build:client`  | Build the production client bundle            |
| `bun test`              | Run the test suite                            |
| `bun run typecheck`     | `tsc --noEmit` across all TypeScript          |

## Layout

```
bloom/
├── server/      # Bun + Hono API
├── client/      # React 19 + Redux Toolkit + Vite
├── shared/      # Types shared across server and client
├── tests/       # Test suite (run via `bun test`)
├── docs/adr/    # Architecture Decision Records
└── CONTEXT.md   # Domain glossary
```
