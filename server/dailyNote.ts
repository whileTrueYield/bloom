// Daily Note module: owns the daily/YYYY-MM-DD.md files. Two writers exist —
// Capture (appendBlock, sacred and AI-free) and direct edits via the Daily
// Notes view (saveDailyNote, used to fix typos in already-captured Blocks).

import { readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

export interface BlockGeo {
  lat: number;
  lon: number;
  accuracy_m?: number | null;
}

export interface AppendBlockOptions {
  text: string;
  geo?: BlockGeo;
  // Injectable clock; production passes nothing and gets `new Date()`.
  now?: Date;
}

export interface AppendBlockResult {
  date: string;
  path: string;
}

interface DailyNoteFrontmatter {
  date: string;
  created: string;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function formatBlockHeading(d: Date, geo?: BlockGeo): string {
  const time = formatTime(d);
  if (!geo) return `## ${time}`;
  const accuracy =
    geo.accuracy_m != null ? ` ±${Math.round(geo.accuracy_m)}m` : "";
  return `## ${time} (${geo.lat}, ${geo.lon}${accuracy})`;
}

export async function appendBlock(
  vaultPath: string,
  opts: AppendBlockOptions,
): Promise<AppendBlockResult> {
  const now = opts.now ?? new Date();
  const date = formatDate(now);
  const filePath = path.join(vaultPath, "daily", `${date}.md`);

  let frontmatter: DailyNoteFrontmatter;
  let existingBody = "";
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = matter(raw);
    frontmatter = parsed.data as DailyNoteFrontmatter;
    existingBody = parsed.content;
  } catch {
    frontmatter = { date, created: now.toISOString() };
  }

  const heading = formatBlockHeading(now, opts.geo);
  const newBlock = `${heading}\n${opts.text}\n`;

  const trimmed = existingBody.replace(/\s+$/, "");
  const newBody = trimmed === ""
    ? newBlock
    : `${trimmed}\n\n---\n\n${newBlock}`;

  await writeFile(filePath, matter.stringify(newBody, frontmatter));

  return { date, path: filePath };
}

// File names under `<vault>/daily` that look like a Daily Note. We accept the
// canonical YYYY-MM-DD.md only — anything else (a stray .DS_Store, a renamed
// note someone dropped into the folder) is ignored rather than crashing the
// list endpoint.
const DAILY_FILENAME_RE = /^(\d{4}-\d{2}-\d{2})\.md$/;

const DAILY_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Cheap structural check used by route handlers to reject inputs like
// `not-a-date` or `../foo` before they reach the filesystem.
export function isValidDailyDate(s: string): boolean {
  return DAILY_DATE_RE.test(s);
}

// Format a Date as YYYY-MM-DD in the host's local timezone — matches the
// filenames Capture writes, so navigation by "today" lands on the same file
// the user has been capturing into all day.
export function todayDate(now: Date = new Date()): string {
  return formatDate(now);
}

export interface EnsureResult {
  date: string;
  path: string;
  created: boolean;
}

// Ensure today's Daily Note file exists. Returns `created: true` if the file
// was just bootstrapped with empty frontmatter, `false` if it was already on
// disk (idempotent). Capture is still the only writer that appends Blocks —
// this exists so the "Today" sidebar link has something to navigate to even
// before the day's first Capture lands.
export async function ensureTodayDailyNote(
  vaultPath: string,
  opts: { now?: Date } = {},
): Promise<EnsureResult> {
  const now = opts.now ?? new Date();
  const date = formatDate(now);
  const filePath = path.join(vaultPath, "daily", `${date}.md`);
  try {
    await stat(filePath);
    return { date, path: filePath, created: false };
  } catch {
    const frontmatter: DailyNoteFrontmatter = {
      date,
      created: now.toISOString(),
    };
    await writeFile(filePath, matter.stringify("", frontmatter));
    return { date, path: filePath, created: true };
  }
}

export interface LoadedDailyNote {
  date: string;
  path: string;
  modified: string;
  body: string;
}

export async function loadDailyNote(
  vaultPath: string,
  date: string,
): Promise<LoadedDailyNote> {
  const filePath = path.join(vaultPath, "daily", `${date}.md`);
  const raw = await readFile(filePath, "utf8");
  const info = await stat(filePath);
  const parsed = matter(raw);
  // Trailing newline is an artifact of gray-matter's serialization, not user
  // content — strip it so round-trip save/load is byte-stable.
  const body = parsed.content.endsWith("\n")
    ? parsed.content.slice(0, -1)
    : parsed.content;
  return {
    date,
    path: filePath,
    modified: info.mtime.toISOString(),
    body,
  };
}

export async function saveDailyNote(
  vaultPath: string,
  date: string,
  body: string,
): Promise<LoadedDailyNote> {
  const filePath = path.join(vaultPath, "daily", `${date}.md`);
  const raw = await readFile(filePath, "utf8");
  const frontmatter = matter(raw).data as DailyNoteFrontmatter;

  // tmp-and-rename keeps the file atomic from any concurrent watcher's POV.
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmpPath, matter.stringify(body, frontmatter));
  await rename(tmpPath, filePath);

  const info = await stat(filePath);
  const normalized = body.endsWith("\n") ? body.slice(0, -1) : body;
  return {
    date,
    path: filePath,
    modified: info.mtime.toISOString(),
    body: normalized,
  };
}

export async function listDailyNoteDates(vaultPath: string): Promise<string[]> {
  const dailyDir = path.join(vaultPath, "daily");
  let names: string[];
  try {
    names = await readdir(dailyDir);
  } catch {
    return [];
  }
  const dates: string[] = [];
  for (const name of names) {
    const m = name.match(DAILY_FILENAME_RE);
    if (m) dates.push(m[1]!);
  }
  dates.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  return dates;
}
