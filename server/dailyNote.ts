// Daily Note module: owns the daily/YYYY-MM-DD.md files. The Capture flow
// is the only writer for these in v0 — every Capture appends a Block here,
// creating today's Daily Note on first call of the day.

import { readFile, writeFile } from "node:fs/promises";
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
