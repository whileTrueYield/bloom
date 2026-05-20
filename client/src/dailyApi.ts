// RTK Query slice for the Daily Notes endpoints. The `DailyList` tag is
// invalidated on save/ensure so the sidebar refreshes when a new Daily Note
// is created; the per-date `Daily` tag keeps the open editor's view fresh
// after watcher events from external edits.

import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type {
  DailyNoteResponse,
  DailyNotesListResponse,
  UpdateDailyNoteRequest,
} from "@shared/types";

export const dailyApi = createApi({
  reducerPath: "dailyApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api" }),
  tagTypes: ["DailyList", "Daily"],
  endpoints: (builder) => ({
    listDailyNotes: builder.query<DailyNotesListResponse, void>({
      query: () => "/daily",
      providesTags: ["DailyList"],
    }),
    getDailyNote: builder.query<DailyNoteResponse, string>({
      query: (date) => `/daily/${date}`,
      providesTags: (_result, _err, date) => [{ type: "Daily", id: date }],
    }),
    ensureToday: builder.mutation<{ date: string }, void>({
      query: () => ({ url: "/daily/today", method: "POST" }),
      invalidatesTags: ["DailyList"],
    }),
    saveDailyNote: builder.mutation<
      DailyNoteResponse,
      { date: string } & UpdateDailyNoteRequest
    >({
      query: ({ date, body }) => ({
        url: `/daily/${date}`,
        method: "PUT",
        body: { body },
      }),
      // Backlinks belong to notesApi; the Workspace dispatches a manual
      // notesApi invalidation on save to keep the right-rail in sync.
      invalidatesTags: (_result, _err, { date }) => [
        "DailyList",
        { type: "Daily", id: date },
      ],
    }),
    deleteDailyNote: builder.mutation<void, string>({
      query: (date) => ({ url: `/daily/${date}`, method: "DELETE" }),
      invalidatesTags: (_result, _err, date) => [
        "DailyList",
        { type: "Daily", id: date },
      ],
    }),
  }),
});

export const {
  useListDailyNotesQuery,
  useGetDailyNoteQuery,
  useEnsureTodayMutation,
  useSaveDailyNoteMutation,
  useDeleteDailyNoteMutation,
} = dailyApi;
