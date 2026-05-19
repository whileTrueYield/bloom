// RTK Query slice for /api/search. The query is debounced upstream in the
// CommandPalette component, so each emitted keystroke at the slice level is
// already a deliberate request.

import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { SearchResponse } from "@shared/types";

export const searchApi = createApi({
  reducerPath: "searchApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api" }),
  endpoints: (builder) => ({
    search: builder.query<SearchResponse, string>({
      query: (q) => `/search?q=${encodeURIComponent(q)}`,
    }),
  }),
});

export const { useSearchQuery } = searchApi;
