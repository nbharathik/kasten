import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { wasmGuard } from "../../scripts/vite-wasm-guard.mjs";

// The editor page. The WebAssembly module sits beside its glue code and is
// found by URL, so the glue is not pre-bundled.
export default defineConfig({
  plugins: [wasmGuard(), react()],
  server: {
    port: 5174,
    strictPort: false,
    fs: { allow: ["../.."] },
    // With SLIDES_API set (the address `slides dev` printed), the page lists and edits the decks of its folder.
    ...(process.env.SLIDES_API ? { proxy: { "/api": process.env.SLIDES_API } } : {}),
  },
  optimizeDeps: { exclude: ["@kasten-slides/wasm"] },
  build: { target: "es2022", chunkSizeWarningLimit: 2500 },
});
