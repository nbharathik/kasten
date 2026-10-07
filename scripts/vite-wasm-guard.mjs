// A Vite plugin for the pages that load the slide engine's WebAssembly: when the dev
// server starts or a page is built, it makes sure packages/slides-wasm/pkg is the build
// the Rust and the editor's code ask for, and builds it if it is not.
//
// `pkg` is not in git. After a pull it can be older than the code that imports it, and
// the browser then says "does not provide an export named ..." and shows nothing. This
// turns that into a rebuild (a few minutes the first time, seconds after) or, when the
// tools for it are missing, into a message that says what to install.
//
// It stays out of the way of tests (VITEST) and of anyone who builds by hand
// (KASTEN_SKIP_WASM_CHECK=1).

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { staleReason } from "./build-wasm.mjs";

const root = resolve(import.meta.dirname, "..");

export function wasmGuard() {
  return {
    name: "kasten-slides-wasm-guard",
    configResolved() {
      if (process.env.VITEST || process.env.KASTEN_SKIP_WASM_CHECK) return;
      const why = staleReason(root);
      if (why === null) return;
      console.log(`\n[wasm] The slide engine's WebAssembly (packages/slides-wasm/pkg) is out of date: ${why}.`);
      console.log("[wasm] Building it now; the first build takes a few minutes.\n");
      const result = spawnSync(process.execPath, [resolve(root, "scripts/build-wasm.mjs"), "--install"], { cwd: root, stdio: "inherit" });
      if (result.status !== 0) {
        throw new Error(
          "The slide engine's WebAssembly is out of date and could not be rebuilt. It needs Rust with the wasm32-unknown-unknown target " +
            "(`rustup target add wasm32-unknown-unknown`); then run `node scripts/build-wasm.mjs --install` in the repository's folder and start again.",
        );
      }
    },
  };
}
