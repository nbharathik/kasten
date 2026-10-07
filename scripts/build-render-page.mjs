// Builds packages/slides-render-page: the page a headless Chrome or Chromium draws decks with. `slides` embeds the
// built folder (crates/slides-render/build.rs reads packages/slides-render-page/dist), so build the page first and
// then the program:
//
//   node scripts/build-render-page.mjs              build (the WebAssembly package first, if it is stale)
//
// The output is the same for the same sources and lock file, so a release build can check it.

import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const PAGE = join(root, "packages/slides-render-page");
const DIST = join(PAGE, "dist");

/** The files under `dir`, as full paths. */
export function filesUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...filesUnder(path));
    else out.push(path);
  }
  return out;
}

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS ?? "--max-old-space-size=3072" } });
  if (result.error || result.status !== 0) {
    console.error(`build-render-page: \`${command} ${args.join(" ")}\` failed`);
    process.exit(result.status ?? 1);
  }
}

export function pageBuildCommand() {
  const require = createRequire(join(PAGE, "package.json"));
  const manifest = require.resolve("vite/package.json");
  return { command: process.execPath, args: [resolve(manifest, "../bin/vite.js"), "build"] };
}

function main() {
  run(process.execPath, ["scripts/build-wasm.mjs", "--if-stale"]);
  const { command, args } = pageBuildCommand();
  run(command, args, PAGE);
  const sizes = filesUnder(DIST).map((path) => statSync(path).size);
  console.log(`render page: ${sizes.length} files, ${(sizes.reduce((a, b) => a + b, 0) / 1e6).toFixed(2)} MB in ${DIST}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
