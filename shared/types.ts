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
