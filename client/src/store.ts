// The Redux store. New slices register their reducer and middleware here.

import { configureStore } from "@reduxjs/toolkit";
import { healthApi } from "./healthApi";
import { vaultApi } from "./vaultApi";
import { notesApi } from "./notesApi";
import { captureApi } from "./captureApi";
import { wikilinkApi } from "./wikilinkApi";
import { searchApi } from "./searchApi";
import { dailyApi } from "./dailyApi";
import { indexApi } from "./indexApi";
import { editorStatusReducer } from "./editorStatusSlice";

export const store = configureStore({
  reducer: {
    [healthApi.reducerPath]: healthApi.reducer,
    [vaultApi.reducerPath]: vaultApi.reducer,
    [notesApi.reducerPath]: notesApi.reducer,
    [captureApi.reducerPath]: captureApi.reducer,
    [wikilinkApi.reducerPath]: wikilinkApi.reducer,
    [searchApi.reducerPath]: searchApi.reducer,
    [dailyApi.reducerPath]: dailyApi.reducer,
    [indexApi.reducerPath]: indexApi.reducer,
    editorStatus: editorStatusReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(
      healthApi.middleware,
      vaultApi.middleware,
      notesApi.middleware,
      captureApi.middleware,
      wikilinkApi.middleware,
      searchApi.middleware,
      dailyApi.middleware,
      indexApi.middleware,
    ),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
