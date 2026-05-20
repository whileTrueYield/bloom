// RTK Query slice for the Notes endpoints. The `Notes` list tag is invalidated
// on create and save so the sidebar updates without manual refetches; the
// per-note `Note` tag keeps the editor's view of the active Note fresh after
// background updates from elsewhere (slice #8 will land that for real).

import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type {
  BacklinksResponse,
  CreateNoteRequest,
  NoteResponse,
  NotesListResponse,
  UpdateNoteRequest,
} from "@shared/types";

export const notesApi = createApi({
  reducerPath: "notesApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api" }),
  // "Backlinks" is invalidated as a whole (not per-id): any save can affect
  // any Note's backlinks, so it's simpler to refetch all subscribed panels
  // than to track which target a given source mentions.
  tagTypes: ["Notes", "Note", "Backlinks"],
  endpoints: (builder) => ({
    listNotes: builder.query<NotesListResponse, void>({
      query: () => "/notes",
      providesTags: ["Notes"],
    }),
    getNote: builder.query<NoteResponse, string>({
      query: (id) => `/notes/${id}`,
      providesTags: (_result, _err, id) => [{ type: "Note", id }],
    }),
    getBacklinks: builder.query<BacklinksResponse, string>({
      query: (id) => `/notes/${id}/backlinks`,
      providesTags: (_result, _err, id) => [{ type: "Backlinks", id }],
    }),
    createNote: builder.mutation<NoteResponse, CreateNoteRequest>({
      query: (body) => ({ url: "/notes", method: "POST", body }),
      invalidatesTags: ["Notes", "Backlinks"],
    }),
    saveNote: builder.mutation<NoteResponse, { id: string } & UpdateNoteRequest>({
      query: ({ id, body, renameConfirmed }) => ({
        url: `/notes/${id}`,
        method: "PUT",
        body: { body, renameConfirmed },
      }),
      invalidatesTags: (_result, _err, { id }) => [
        "Notes",
        { type: "Note", id },
        "Backlinks",
      ],
    }),
  }),
});

export const {
  useListNotesQuery,
  useGetNoteQuery,
  useGetBacklinksQuery,
  useCreateNoteMutation,
  useSaveNoteMutation,
} = notesApi;
