// Settings persistence: a tiny JSON file at a caller-supplied path.
// The path is a parameter (not hard-coded to ~/Library/...) so tests can use
// temp paths and the production wiring can compose the platform-specific
// directory in one place.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface Settings {
  vaultPath: string | null;
}

const DEFAULTS: Settings = { vaultPath: null };

export async function loadSettings(filePath: string): Promise<Settings> {
  try {
    const raw = await readFile(filePath, "utf8");
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveSettings(
  filePath: string,
  patch: Partial<Settings>,
): Promise<Settings> {
  const current = await loadSettings(filePath);
  const next: Settings = { ...current, ...patch };
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(next, null, 2));
  return next;
}
