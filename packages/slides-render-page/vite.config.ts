import react from "@vitejs/plugin-react";
import { type Plugin, defineConfig } from "vite";

/**
 * Fonts come in several formats and the style sheets of the fonts name them all, for old browsers. The one browser
 * this page is for reads WOFF2, so the others are left out of the page: without it the page would carry each font
 * three times over.
 */
function woff2Only(): Plugin {
  const OTHER_FORMATS = /,\s*url\([^)]*\.(?:woff|ttf)\)\s*format\(\s*["']?(?:woff|truetype)["']?\s*\)/g;
  return {
    name: "woff2-only",
    apply: "build",
    generateBundle(_options, bundle) {
      for (const [name, item] of Object.entries(bundle)) {
        if (item.type === "asset" && name.endsWith(".css") && typeof item.source === "string") item.source = item.source.replace(OTHER_FORMATS, "");
      }
      for (const name of Object.keys(bundle)) if (/\.(?:woff|ttf)$/.test(name)) delete bundle[name];
    },
  };
}

// The render page: a static, offline page. Everything it needs is in the build folder (the script, the WebAssembly
// module beside its glue, the styles and the fonts). It is served from the root of its own address, so the addresses
// in it are absolute paths: the font files a style sheet names are read by the page's own code (for the HTML export),
// which would find a relative address in the wrong place.
export default defineConfig({
  base: "/",
  plugins: [react(), woff2Only()],
  server: { port: 5411, strictPort: false, host: "127.0.0.1", fs: { allow: ["../.."] } },
  optimizeDeps: { exclude: ["@kasten-slides/wasm"] },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: false,
    modulePreload: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 2500,
  },
});
