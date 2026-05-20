// Shared response shapes used by both the Bun/Hono server and the React
// client. Lives at the workspace root so the same source of truth is imported
// on both sides via the `@shared/*` path alias.

export interface HealthResponse {
  ok: boolean;
}

export interface VaultResponse {
  path: string | null;
}

export interface VaultSetRequest {
  path: string;
}

export interface ApiError {
  error: string;
  message: string;
}

export interface GeoStamp {
  lat: number | null;
  lon: number | null;
  place: string | null;
  accuracy_m: number | null;
}

export interface NoteFrontmatter {
  id: string;
  created: string;
  geo: GeoStamp;
}

export interface NoteSummary {
  id: string;
  modified: string;
}

export interface NoteResponse {
  id: string;
  path: string;
  modified: string;
  frontmatter: NoteFrontmatter;
  body: string;
}

export interface CreateNoteRequest {
  geo?: Partial<GeoStamp>;
}

export interface UpdateNoteRequest {
  body: string;
}

export interface NotesListResponse {
  notes: NoteSummary[];
}

export interface DailyNoteSummary {
  date: string;
}

export interface DailyNotesListResponse {
  daily: DailyNoteSummary[];
}

export interface DailyNoteResponse {
  date: string;
  path: string;
  modified: string;
  body: string;
}

export interface UpdateDailyNoteRequest {
  body: string;
}

export interface CaptureRequest {
  text: string;
  geo?: {
    lat: number;
    lon: number;
    accuracy_m?: number | null;
  };
}

export interface CaptureResponse {
  date: string;
  path: string;
}

export interface WikilinkResolveResponse {
  id: string | null;
}

export interface WikilinkSuggestion {
  id: string;
  title: string;
  modified: string;
  tier: 1 | 2;
}

export interface WikilinkSuggestResponse {
  suggestions: WikilinkSuggestion[];
}

export interface NoteSearchResult {
  kind: "note";
  noteId: string;
  title: string | null;
  snippet: string;
  rank: number;
}

export interface BlockSearchResult {
  kind: "block";
  dailyDate: string;
  blockIndex: number;
  time: string | null;
  snippet: string;
  rank: number;
}

export type SearchResult = NoteSearchResult | BlockSearchResult;

export interface SearchResponse {
  results: SearchResult[];
}

export interface IndexRebuildResponse {
  notes: number;
  daily: number;
}

// Vault watcher events published by GET /api/events (SSE). The `kind` field
// is also the SSE event name so EventSource listeners can target one channel.
export type VaultEvent =
  | { kind: "note"; noteId: string; action: "changed" | "deleted" }
  | { kind: "daily"; dailyDate: string; action: "changed" | "deleted" };

// Backlinks: every source (Note or Daily Note Block) that contains a Wikilink
// pointing at a given target Note. Snippets are extracted server-side from
// the source's body so the UI can render context with no extra lookups.
export type BacklinkSource =
  | { kind: "note"; noteId: string; title: string | null; snippet: string }
  | {
      kind: "block";
      dailyDate: string;
      blockIndex: number;
      time: string | null;
      snippet: string;
    };

export interface BacklinksResponse {
  backlinks: BacklinkSource[];
}
