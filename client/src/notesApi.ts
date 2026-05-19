// RTK Query slice for the Notes endpoints. The `Notes` list tag is invalidated
// on create and save so the sidebar updates without manual refetches; the
// per-note `Note` tag keeps the editor's view of the active Note fresh after
// background updates from elsewhere (slice #8 will land that for real).

import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type {
  CreateNoteRequest,
  NoteResponse,
  NotesListResponse,
  UpdateNoteRequest,
} from "@shared/types";

export const notesApi = createApi({
  reducerPath: "notesApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api" }),
  tagTypes: ["Notes", "Note"],
  endpoints: (builder) => ({
    listNotes: builder.query<NotesListResponse, void>({
      query: () => "/notes",
      providesTags: ["Notes"],
    }),
    getNote: builder.query<NoteResponse, string>({
      query: (id) => `/notes/${id}`,
      providesTags: (_result, _err, id) => [{ type: "Note", id }],
    }),
    createNote: builder.mutation<NoteResponse, CreateNoteRequest>({
      query: (body) => ({ url: "/notes", method: "POST", body }),
      invalidatesTags: ["Notes"],
    }),
    saveNote: builder.mutation<NoteResponse, { id: string } & UpdateNoteRequest>({
      query: ({ id, body }) => ({
        url: `/notes/${id}`,
        method: "PUT",
        body: { body },
      }),
      invalidatesTags: (_result, _err, { id }) => [
        "Notes",
        { type: "Note", id },
      ],
    }),
  }),
});

export const {
  useListNotesQuery,
  useGetNoteQuery,
  useCreateNoteMutation,
  useSaveNoteMutation,
} = notesApi;
