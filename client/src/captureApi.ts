// RTK Query slice for /api/capture. A Capture writes a new Block into today's
// Daily Note, so on success this slice invalidates dailyApi caches (so the
// sidebar's date list and any open Daily Note refetch) and notesApi backlinks
// (a [[wikilink]] inside the Block could be a new backlink for some Note).

import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { CaptureRequest, CaptureResponse } from "@shared/types";
import { notesApi } from "./notesApi";
import { dailyApi } from "./dailyApi";

export const captureApi = createApi({
  reducerPath: "captureApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api" }),
  endpoints: (builder) => ({
    capture: builder.mutation<CaptureResponse, CaptureRequest>({
      query: (body) => ({ url: "/capture", method: "POST", body }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(
            dailyApi.util.invalidateTags([
              "DailyList",
              { type: "Daily", id: data.date },
            ]),
          );
          dispatch(notesApi.util.invalidateTags(["Backlinks"]));
        } catch {
          /* network errors propagate via the mutation result */
        }
      },
    }),
  }),
});

export const { useCaptureMutation } = captureApi;
