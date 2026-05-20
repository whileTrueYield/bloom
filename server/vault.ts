// Vault module: filesystem operations over the user-chosen Vault folder.
// Public surface stays small (validation + bootstrap) so the rest of the app
// only sees structured results, not raw FS errors.

import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { GeoStamp, NoteFrontmatter, NoteSummary } from "@shared/types";

export const VAULT_SUBDIRS = ["notes", "daily", "attachments"] as const;

const EMPTY_GEO: GeoStamp = {
  lat: null,
  lon: null,
  place: null,
  accuracy_m: null,
};

export interface Note {
  id: string;
  path: string;
  modified: string;
  frontmatter: NoteFrontmatter;
  body: string;
}

export interface CreateNoteOptions {
  geo?: Partial<GeoStamp>;
  // Injectable clock — used by tests to assert deterministic ids.
  now?: Date;
}

// Note id: YYYYMMDDTHHMMSSsss in UTC. Sortable lexicographically.
function formatId(date: Date): string {
  return date.toISOString().replace(/[-:.Z]/g, "");
}

// Canonical body form has no trailing newline. The on-disk file always does
// (gray-matter inserts one); we strip it on read and don't require callers to
// preserve it on write.
function normalizeBody(s: string): string {
  return s.endsWith("\n") ? s.slice(0, -1) : s;
}

export type VaultValidationError =
  | "PATH_NOT_FOUND"
  | "PATH_NOT_DIRECTORY"
  | "PATH_NOT_WRITABLE";

export type VaultValidation =
  | { ok: true; path: string }
  | { ok: false; error: VaultValidationError; message: string };

export async function validateVaultPath(absPath: string): Promise<VaultValidation> {
  let info;
  try {
    info = await stat(absPath);
  } catch {
    return {
      ok: false,
      error: "PATH_NOT_FOUND",
      message: `Vault path does not exist: ${absPath}`,
    };
  }

  if (!info.isDirectory()) {
    return {
      ok: false,
      error: "PATH_NOT_DIRECTORY",
      message: `Vault path is not a directory: ${absPath}`,
    };
  }

  return { ok: true, path: absPath };
}

export async function bootstrapVaultLayout(vaultPath: string): Promise<void> {
  for (const sub of VAULT_SUBDIRS) {
    await mkdir(path.join(vaultPath, sub), { recursive: true });
  }
}

export async function createNote(
  vaultPath: string,
  opts: CreateNoteOptions = {},
): Promise<Note> {
  const now = opts.now ?? new Date();
  const baseId = formatId(now);
  const body = "";

  // Retry with a numeric suffix on collision. The `wx` flag makes the
  // existence-check atomic with the write, so two concurrent callers can't
  // both think a given id is free.
  for (let suffix = 0; suffix < 1000; suffix++) {
    const id = suffix === 0 ? baseId : `${baseId}-${suffix}`;
    const filePath = path.join(vaultPath, "notes", `${id}.md`);
    const frontmatter: NoteFrontmatter = {
      id,
      created: now.toISOString(),
      geo: { ...EMPTY_GEO, ...(opts.geo ?? {}) },
    };
    try {
      await writeFile(filePath, matter.stringify(body, frontmatter), {
        flag: "wx",
      });
      return {
        id,
        path: filePath,
        modified: now.toISOString(),
        frontmatter,
        body: normalizeBody(body),
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
  }
  throw new Error(`Too many id collisions creating note at ${baseId}`);
}

export async function loadNote(vaultPath: string, id: string): Promise<Note> {
  const filePath = path.join(vaultPath, "notes", `${id}.md`);
  const raw = await readFile(filePath, "utf8");
  const parsed = matter(raw);
  const info = await stat(filePath);
  return {
    id,
    path: filePath,
    modified: info.mtime.toISOString(),
    frontmatter: parsed.data as NoteFrontmatter,
    body: normalizeBody(parsed.content),
  };
}

export async function listNotes(vaultPath: string): Promise<NoteSummary[]> {
  const notesDir = path.join(vaultPath, "notes");
  let names: string[];
  try {
    names = await readdir(notesDir);
  } catch {
    return [];
  }
  const entries = await Promise.all(
    names
      .filter((n) => n.endsWith(".md"))
      .map(async (name) => {
        const filePath = path.join(notesDir, name);
        const info = await stat(filePath);
        return {
          id: name.slice(0, -3),
          modified: info.mtime.toISOString(),
          mtimeMs: info.mtimeMs,
        };
      }),
  );
  entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return entries.map(({ id, modified }) => ({ id, modified }));
}

// Returns the file path that was unlinked so the caller can pass it to the
// watcher's markSelfWrite — the deletion still fires an fs event the watcher
// would otherwise re-broadcast as an external change.
export async function deleteNote(
  vaultPath: string,
  id: string,
): Promise<string> {
  const filePath = path.join(vaultPath, "notes", `${id}.md`);
  await unlink(filePath);
  return filePath;
}

export async function saveNote(
  vaultPath: string,
  id: string,
  body: string,
): Promise<Note> {
  const filePath = path.join(vaultPath, "notes", `${id}.md`);
  const raw = await readFile(filePath, "utf8");
  const frontmatter = matter(raw).data as NoteFrontmatter;

  // Write to a tmp file then rename. Rename is atomic on the same filesystem,
  // which protects against partial writes if the process dies mid-save.
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmpPath, matter.stringify(body, frontmatter));
  await rename(tmpPath, filePath);

  const info = await stat(filePath);
  return {
    id,
    path: filePath,
    modified: info.mtime.toISOString(),
    frontmatter,
    body: normalizeBody(body),
  };
}
