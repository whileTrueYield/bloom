// RTK Query slice for the server health endpoint. Acts as the canonical
// example of how the client talks to the Bun server: a typed query whose
// response shape lives in @shared/types so server and client never drift.

import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { HealthResponse } from "@shared/types";

export const healthApi = createApi({
  reducerPath: "healthApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api" }),
  endpoints: (builder) => ({
    getHealth: builder.query<HealthResponse, void>({
      query: () => "/health",
    }),
  }),
});

export const { useGetHealthQuery } = healthApi;
