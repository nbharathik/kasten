// The TypeScript types and JSON Schemas the Slides packages use are written
// by the tests of crates/slides-core, from the Rust types, into
// packages/slides-wasm/ts/generated. This runs those tests and adds the index
// that re-exports every type. Nothing there is written by hand.
//
//   node scripts/gen-slides.mjs            regenerate
//   node scripts/gen-slides.mjs --check    regenerate, then fail if a file had to change

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DIR = "packages/slides-wasm/ts/generated";

/** The text of index.ts for the given type files, in a fixed order. */
export function indexOf(files) {
  const names = files
    .filter((f) => f.endsWith(".ts") && f !== "index.ts")
    .map((f) => f.slice(0, -3))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  // JSON values come from a folder of their own, and merge patches are made of them.
  const lines = [...names.map((n) => `export type * from "./${n}.ts";`), 'export type * from "./serde_json/JsonValue.ts";'];
  return `// Generated from slides-core by scripts/gen-slides.mjs. Do not edit.\n${lines.join("\n")}\n`;
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error || result.status !== 0) process.exit(result.status ?? 1);
}

/** Every file under the folder, by path relative to it (JSON values live in a folder of their own). */
export function snapshot(dir, prefix = "") {
  const files = new Map();
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    // Nothing generated yet.
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const [name, text] of snapshot(path, `${prefix}${entry.name}/`)) files.set(name, text);
    } else {
      files.set(`${prefix}${entry.name}`, readFileSync(path, "utf8"));
    }
  }
  return files;
}

/** The names of the files that differ between two snapshots, added or removed ones included. */
export function differences(before, after) {
  const names = new Set([...before.keys(), ...after.keys()]);
  return [...names].filter((n) => before.get(n) !== after.get(n)).sort();
}

function main() {
  const root = resolve(import.meta.dirname, "..");
  const dir = join(root, DIR);
  const before = snapshot(dir);
  run("cargo", ["test", "-p", "slides-core", "--locked", "--quiet"], root);
  const index = indexOf(readdirSync(dir));
  if (before.get("index.ts") !== index) writeFileSync(join(dir, "index.ts"), index);
  if (process.argv.includes("--check")) {
    const stale = differences(before, snapshot(dir));
    if (stale.length > 0) {
      console.error(`The generated Slides types were stale and have been rewritten. Commit them:\n  ${stale.join("\n  ")}`);
      process.exit(1);
    }
    console.log("The generated Slides types are up to date.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
