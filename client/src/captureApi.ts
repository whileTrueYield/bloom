// RTK Query slice for /api/capture. The Daily Notes list isn't loaded
// anywhere yet in v0, but when slice #12 adds that view it'll subscribe to
// the `DailyNote` tag this mutation invalidates.

import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { CaptureRequest, CaptureResponse } from "@shared/types";
import { notesApi } from "./notesApi";

export const captureApi = createApi({
  reducerPath: "captureApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api" }),
  tagTypes: ["DailyNote"],
  endpoints: (builder) => ({
    capture: builder.mutation<CaptureResponse, CaptureRequest>({
      query: (body) => ({ url: "/capture", method: "POST", body }),
      invalidatesTags: ["DailyNote"],
      // A Capture can introduce a new [[wikilink]] from a Daily Note Block to
      // a Note — so the destination Note's backlinks panel needs to refetch.
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(notesApi.util.invalidateTags(["Backlinks"]));
        } catch {
          /* network errors propagate via the mutation result */
        }
      },
    }),
  }),
});

export const { useCaptureMutation } = captureApi;
