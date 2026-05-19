# Vault syncs, Index does not

The **Vault** (markdown files) is the source of truth and is meant to live in a synced folder (iCloud Drive, Dropbox, git). The **Index** (SQLite with embeddings, FTS, link graph) is a per-machine local cache stored under `~/Library/Application Support/Bloom/<vault-hash>/` and is never synced.

Co-locating the index inside the vault was considered and rejected for three reasons: (1) SQLite write semantics conflict with lazy cloud-sync, risking DB corruption; (2) embeddings are derived data — syncing them wastes bandwidth and forces stale data across devices; (3) keeping the vault as pure markdown preserves portability (Obsidian, git, grep) and decouples the indexing technology from the storage format, so we can swap SQLite for LanceDB/Qdrant/whatever later with zero data migration.

The cost: a new machine must rebuild the index on first open (expected to take ~1 minute for a typical vault). Acceptable.
