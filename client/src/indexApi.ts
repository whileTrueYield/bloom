// RTK Query slice for /api/index — the Settings page reads stats here and
// triggers rebuilds. Both endpoints are guarded by requireVault on the server
// so they're only reachable once a Vault is configured.

import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { IndexRebuildResponse, IndexStatsResponse } from "@shared/types";

export const indexApi = createApi({
  reducerPath: "indexApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api" }),
  tagTypes: ["IndexStats"],
  endpoints: (builder) => ({
    getIndexStats: builder.query<IndexStatsResponse, void>({
      query: () => "/index/stats",
      providesTags: ["IndexStats"],
    }),
    rebuildIndex: builder.mutation<IndexRebuildResponse, void>({
      query: () => ({ url: "/index/rebuild", method: "POST" }),
      invalidatesTags: ["IndexStats"],
    }),
  }),
});

export const { useGetIndexStatsQuery, useRebuildIndexMutation } = indexApi;
