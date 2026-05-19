# Bun + TypeScript end-to-end

The server runtime is Bun and both server and client are written in TypeScript, sharing types for domain models (Note, GeoStamp, etc.) directly across the boundary. Considered Node (more mature, weaker ergonomics — needs `package.json` for every primitive we get built-in from Bun), Go (faster but splits the stack across two languages), Rust (overkill for an HTTP+SQLite app), and Python (worst deployment story, no single binary). Bun won on solo-dev velocity: built-in HTTP server, built-in SQLite with extension loading (for `sqlite-vec`), built-in bundler, built-in fs watcher, single-binary build via `bun build --compile` for eventual k8s deployment.

The portability risk (Bun-only APIs locking us in) is acceptable: the deployment targets are a Mac and a user-controlled k8s cluster, both of which can run Bun fine. If we ever needed to move to Node, the TypeScript itself is portable — the swap would be mechanical, not a rewrite.
