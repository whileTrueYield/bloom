// The Redux store. New slices register their reducer and middleware here.

import { configureStore } from "@reduxjs/toolkit";
import { healthApi } from "./healthApi";
import { vaultApi } from "./vaultApi";
import { notesApi } from "./notesApi";

export const store = configureStore({
  reducer: {
    [healthApi.reducerPath]: healthApi.reducer,
    [vaultApi.reducerPath]: vaultApi.reducer,
    [notesApi.reducerPath]: notesApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(
      healthApi.middleware,
      vaultApi.middleware,
      notesApi.middleware,
    ),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
