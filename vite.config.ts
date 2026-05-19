// Vite config for Bloom's React client. Source lives in ./client, output goes
// to ./dist/client. The dev server proxies /api/* to the Bun server on :3000
// so the client sees a single origin and CORS never enters the picture.

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const root = import.meta.dirname;

export default defineConfig({
  root: path.resolve(root, "client"),
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": path.resolve(root, "shared"),
      "@client": path.resolve(root, "client/src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
  build: {
    outDir: path.resolve(root, "dist/client"),
    emptyOutDir: true,
  },
});
