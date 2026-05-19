# Bloom

A local-first second brain in the Zettelkasten tradition: small atomic markdown notes, dense links, geo-stamped capture, and AI surfaces tuned per-task instead of bolted onto one chat sidebar. Runs as a Bun HTTP server on the user's Mac with a browser UI, talks to local Ollama for all model calls.

## Language

### Storage

**Vault**:
A user-chosen folder containing all markdown files (Notes, Daily Notes, attachments). The source of truth. Typically synced via iCloud Drive or similar.
_Avoid_: Library, database, workspace

**Note**:
An atomic, durable, linkable markdown file expressing a single idea. The Zettelkasten unit.
_Avoid_: Document, entry, page, atomic note (redundant)

**Daily Note**:
A timestamped, date-named markdown file used as the inbox for **Capture**. Contains one or more **Blocks**. Not a kind of **Note** — a separate concept that happens to also be a markdown file.
_Avoid_: Journal, log, diary

**Block**:
A `---`-separated chunk inside a **Daily Note**, representing one **Capture**. Each **Block** carries its own timestamp and **Geo Stamp** in its heading.
_Avoid_: Section, entry, paragraph

**Index**:
A per-machine local cache (SQLite with `sqlite-vec` + FTS5) of derived data — embeddings, full-text search, link graph — computed from the **Vault**. Rebuildable, never synced.
_Avoid_: Cache, store, DB

### Frontmatter fields

**Geo Stamp**:
The latitude/longitude (and optional place name + accuracy) attached to a **Note** or **Block** at the moment of creation, via the browser Geolocation API.
_Avoid_: Location, coordinates, position

**Tag**:
A `#keyword` marker on a **Note** stored in frontmatter, used as a secondary index alongside the link graph. AI-suggested, user-curated.
_Avoid_: Label, category

**Alias**:
An alternative name for a **Note** stored in frontmatter, used to resolve **Wikilinks** when the link text doesn't match the title exactly.
_Avoid_: Shortcut, nickname, also-known-as

**Summary**:
A one-line, AI-generated description of a **Note**, regenerated on debounced save. Used as the retrieval-grade representation across autocomplete, search, and citations.
_Avoid_: Description, abstract, preview

### Linking

**Wikilink**:
A `[[title]]` (or `[[alias]]`) reference from one **Note** to another, forming the knowledge graph. Stored as title text, not ID — renames atomically rewrite backlinks.
_Avoid_: Link, reference, internal link

### User actions

**Capture**:
The act of recording a fleeting thought with near-zero friction (Cmd+Shift+N → modal → type → Enter). Always appends a new **Block** to today's **Daily Note**, geo-stamped. No AI runs during **Capture** — the firehose is sacred.
_Avoid_: Quick add, jot, inbox

**Distill**:
The act of promoting one or more **Blocks** from a **Daily Note** into a new **Note**. AI-assisted: proposes splits, titles, **Summary**, **Tags**, and **Wikilinks**; user accepts, edits, or rejects. Manual non-AI promotion is also supported.
_Avoid_: Promote, extract, refine, atomize

### AI surfaces

**Ghost Completion**:
Inline gray suggestion text in the **Note** editor (Tab to accept, Esc to dismiss). Disabled in **Daily Notes** to protect **Capture** flow. Off by default per vault.
_Avoid_: Autocomplete (overloaded), inline AI, Copilot

**Slash Command**:
An explicit AI action triggered by typing `/` in the editor (`/clean`, `/summarize`, `/title`, `/expand`, `/related`, `/link`). Always shows a diff/preview before applying.
_Avoid_: AI command, prompt

**Ask Bloom**:
The conversational RAG surface in the right sidebar (Cmd+I). Answers questions grounded in the **Vault**, with cited **Notes** and **Blocks**. Supports `@web` for SearXNG-backed web augmentation. Read-only over the **Vault** — does not write.
_Avoid_: Chat, copilot, assistant

## Relationships

- A **Vault** contains many **Notes** and many **Daily Notes**.
- An **Index** is derived from exactly one **Vault**.
- A **Note** has exactly one **Geo Stamp**, many **Wikilinks**, many **Tags**, many **Aliases**, and exactly one **Summary**.
- A **Daily Note** contains many **Blocks**; each **Block** has its own **Geo Stamp**.
- A **Capture** produces a new **Block** in today's **Daily Note**.
- A **Distill** consumes one or more **Blocks** and produces one or more new **Notes**.
- **Wikilinks** point from **Notes** to **Notes** (the knowledge graph). **Blocks** can also contain **Wikilinks**, which count as backlinks toward the target **Note**.

## Example dialogue

> **Dev:** "When the user hits Cmd+Shift+N during a meeting and types a thought, what gets created?"
> **Domain expert:** "A new **Block** appended to today's **Daily Note**, with a **Geo Stamp** from the laptop's location. No AI runs — that's the firehose; **Capture** is sacred."
>
> **Dev:** "What happens to that **Block** later?"
> **Domain expert:** "Most stay there as raw thought. Some get **Distill**ed — the user picks one or more **Blocks**, AI proposes a new **Note** with a draft title, **Summary**, **Tags**, and **Wikilinks** to related material in the **Vault**. User accepts, edits, or rejects."
>
> **Dev:** "Are **Daily Notes** themselves searchable?"
> **Domain expert:** "Yes — the **Index** embeds each **Block** separately and adds them to FTS. **Ask Bloom** retrieves from both **Notes** and **Daily Note Blocks**, but cites them differently so the user knows whether a hit came from a durable **Note** or a raw **Capture**."

## Flagged ambiguities

- **"Note"** is *not* an umbrella term for any markdown file in the **Vault**. A **Note** is specifically the atomic, durable, linkable kind. A **Daily Note** is a separate concept — overlap in the word "Note" is historical convention from PKM tools, but in Bloom they are distinct types with distinct behaviors. When you need an umbrella term, say "markdown file" or "**Vault** file."
- **"Autocomplete"** is used by users to mean two unrelated things: (1) **Wikilink** suggestions when typing `[[`, and (2) **Ghost Completion** prose suggestions. Internally we always use the specific term.
