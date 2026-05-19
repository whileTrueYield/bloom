// Pure parser for the Daily Note Block format established by Capture
// (slice #6). Splits a Daily Note body by H2 headings, extracts time +
// optional geo coords from each heading, and gathers the text underneath.

export interface ParsedBlockGeo {
  lat: number;
  lon: number;
  accuracy_m: number | null;
}

export interface ParsedBlock {
  time: string | null;
  geo: ParsedBlockGeo | null;
  text: string;
}

// `## HH:MM` optionally followed by `(lat, lon[ ±Nm])`.
const HEADING_RE =
  /^##\s+(\d{2}:\d{2})(?:\s*\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)(?:\s*±(\d+)m)?\))?\s*$/;

export function parseDailyNoteBlocks(body: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  let current: ParsedBlock | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (current) {
      current.text = buffer.join("\n").trim();
      blocks.push(current);
    }
    buffer = [];
  };

  for (const line of body.split("\n")) {
    const match = line.match(HEADING_RE);
    if (match) {
      flush();
      const [, time, lat, lon, acc] = match;
      const geo =
        lat && lon
          ? {
              lat: Number(lat),
              lon: Number(lon),
              accuracy_m: acc ? Number(acc) : null,
            }
          : null;
      current = { time: time ?? null, geo, text: "" };
    } else if (line.trim() === "---") {
      // Block separator — flush the current block and wait for the next heading.
      flush();
      current = null;
    } else if (current) {
      buffer.push(line);
    }
  }
  flush();

  return blocks;
}
