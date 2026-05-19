// RTK Query slice for the Vault endpoints. The query tag system keeps the
// TopBar's display in sync the moment the user submits a new path from the
// settings form — no manual refetch needed.

import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { ApiError, VaultResponse, VaultSetRequest } from "@shared/types";

export const vaultApi = createApi({
  reducerPath: "vaultApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api" }),
  tagTypes: ["Vault"],
  endpoints: (builder) => ({
    getVault: builder.query<VaultResponse, void>({
      query: () => "/vault",
      providesTags: ["Vault"],
    }),
    setVault: builder.mutation<VaultResponse, VaultSetRequest>({
      query: (body) => ({ url: "/vault", method: "POST", body }),
      invalidatesTags: ["Vault"],
      transformErrorResponse: (res) => res.data as ApiError,
    }),
  }),
});

export const { useGetVaultQuery, useSetVaultMutation } = vaultApi;
