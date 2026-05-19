// RTK Query slice for the Wikilink resolver. The CodeMirror extension calls
// through this so resolution requests are cached and deduplicated by RTK —
// typing in many [[hello]] occurrences only hits the server once.

import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type {
  WikilinkResolveResponse,
  WikilinkSuggestResponse,
} from "@shared/types";

export const wikilinkApi = createApi({
  reducerPath: "wikilinkApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api" }),
  tagTypes: ["Wikilink"],
  endpoints: (builder) => ({
    resolveWikilink: builder.query<WikilinkResolveResponse, string>({
      query: (text) => `/wikilink/resolve?text=${encodeURIComponent(text)}`,
      providesTags: (_r, _e, text) => [{ type: "Wikilink", id: text }],
    }),
    suggestWikilinks: builder.query<WikilinkSuggestResponse, string>({
      query: (q) => `/wikilink/suggest?q=${encodeURIComponent(q)}`,
    }),
  }),
});

export const { useResolveWikilinkQuery } = wikilinkApi;
