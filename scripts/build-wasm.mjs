// Builds packages/slides-wasm/pkg: slides-core for the browser, through
// wasm-bindgen. The editor imports it as @kasten-slides/wasm.
//
//   node scripts/build-wasm.mjs               build
//   node scripts/build-wasm.mjs --if-stale    build only if the build is missing, made from other Rust, or lacks something the editor imports
//   node scripts/build-wasm.mjs --install     install the wasm-bindgen command first, if it is missing
//
// `pkg` is not in git: everyone builds it, and it goes out of date whenever the
// Rust behind it changes (after a pull, say). The dev server and the builds of the
// pages that use it run `--if-stale` first, so a stale `pkg` is rebuilt instead of
// failing in the browser with "does not provide an export named ...".
//
// Needs the wasm32 target (rust-toolchain.toml lists it) and a
// wasm-bindgen command of the same version as the library in Cargo.lock:
//
//   cargo install wasm-bindgen-cli --locked --version <that version>

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const OUT = "packages/slides-wasm/pkg";
const OUTPUT_WASM = `${OUT}/slides_wasm_bg.wasm`;
const GLUE = `${OUT}/slides_wasm.js`;
/** Written after a build: a fingerprint of the Rust it was made from. */
const STAMP = `${OUT}/.source-hash`;
/** Where the editor's code imports the glue: every name it takes from there must be in the build. */
const CALLERS = "packages/slides-wasm/ts";
/** What the WebAssembly is made from: slides-wasm and the crates it uses. */
const INPUTS = ["Cargo.toml", "Cargo.lock", "rust-toolchain.toml", "crates/slides-core", "crates/slides-pptx", "packages/slides-wasm/Cargo.toml", "packages/slides-wasm/src"];
const SOURCE = /(\.rs|\.toml|Cargo\.lock)$/;
/** Folders that hold no source of the build, and the tests, which do not change it. */
const LEFT_OUT = new Set(["target", "node_modules", "pkg", ".git", "tests", "benches"]);

/** The version of the wasm-bindgen library that Cargo.lock pins. */
export function lockedVersion(lock) {
  return lock.match(/\[\[package\]\]\nname = "wasm-bindgen"\nversion = "([^"]+)"/)?.[1] ?? null;
}

/**
 * A fingerprint of the Rust the WebAssembly is built from: the names and the contents of its
 * sources and manifests. It changes when they do and only then, whatever the files' times say
 * (a checkout gives files the time it ran).
 */
export function sourceHash(base) {
  const hash = createHash("sha256");
  const visit = (path) => {
    let stat;
    try {
      stat = statSync(join(base, path));
    } catch {
      return;
    }
    if (stat.isDirectory()) {
      for (const name of readdirSync(join(base, path)).sort()) if (!LEFT_OUT.has(name)) visit(`${path}/${name}`);
    } else if (SOURCE.test(path) && !path.endsWith("/tests.rs")) {
      hash.update(`${path}\0`);
      hash.update(readFileSync(join(base, path)));
      hash.update("\0");
    }
  };
  for (const input of INPUTS) visit(input);
  return hash.digest("hex");
}

/** The names the glue exports (wasm-bindgen writes `export function f`, `export class C` and one `export { ... }`). */
export function exportedNames(glue) {
  const names = new Set();
  for (const match of glue.matchAll(/^export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([\w$]+)/gm)) names.add(match[1]);
  for (const match of glue.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of match[1].split(",")) if (part.trim()) names.add(part.trim().split(/\s+as\s+/).pop().trim());
  }
  if (/^export\s+default\b/m.test(glue)) names.add("default");
  return names;
}

/** The names a TypeScript file takes from the glue (types are left out: they are gone when it runs). */
export function importedNames(source) {
  const names = new Set();
  for (const match of source.matchAll(/import\s+([\w\s,{}$]*?)\s*from\s*["'](?:\.\.\/)+pkg\/slides_wasm\.js["']/g)) {
    const clause = match[1].trim();
    if (/^type\s/.test(clause)) continue;
    const braces = clause.match(/\{([^}]*)\}/);
    if (clause.replace(/\{[^}]*\}/, "").replace(/,/g, "").trim()) names.add("default");
    for (const part of braces?.[1].split(",") ?? []) {
      const item = part.trim();
      if (item && !/^type\s/.test(item)) names.add(item.split(/\s+as\s+/)[0].trim());
    }
  }
  return [...names];
}

/** What the editor's code imports from the glue and the build at `base` does not export. */
export function missingExports(base) {
  let glue;
  try {
    glue = readFileSync(join(base, GLUE), "utf8");
  } catch {
    return [];
  }
  const have = exportedNames(glue);
  const wanted = new Set();
  let files = [];
  try {
    files = readdirSync(join(base, CALLERS)).filter((name) => name.endsWith(".ts") && !/\.(test|spec)\.ts$/.test(name));
  } catch {
    // No callers, nothing is wanted.
  }
  for (const name of files) for (const wantedName of importedNames(readFileSync(join(base, CALLERS, name), "utf8"))) wanted.add(wantedName);
  return [...wanted].filter((name) => !have.has(name)).sort();
}

/** Why the build in `pkg` cannot be used, or null when it can. */
export function staleReason(base) {
  if (!existsSync(join(base, OUTPUT_WASM)) || !existsSync(join(base, GLUE))) return "it has not been built";
  let stamp = null;
  try {
    stamp = readFileSync(join(base, STAMP), "utf8").trim();
  } catch {
    // Built by hand, or before builds kept a record.
  }
  if (stamp === null) return "it was built without a record of the Rust behind it";
  if (stamp !== sourceHash(base)) return "the Rust behind it has changed";
  const missing = missingExports(base);
  if (missing.length > 0) return `it does not export ${missing.join(", ")}, which the editor imports`;
  return null;
}

/** Whether the build in `pkg` is missing, made from other Rust, or lacks something the editor imports. */
export function isStale(base) {
  return staleReason(base) !== null;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", ...options });
  if (result.error || result.status !== 0) {
    console.error(`build-wasm: \`${command} ${args.join(" ")}\` failed`);
    process.exit(result.status ?? 1);
  }
}

function main() {
  if (process.argv.includes("--if-stale")) {
    const why = staleReason(root);
    if (why === null) return;
    console.log(`build-wasm: building the WebAssembly (packages/slides-wasm/pkg), because ${why}.`);
  }
  // What the build starts from: a source that changes while it runs makes the next check stale, as it should.
  const fingerprint = sourceHash(root);

  const wanted = lockedVersion(readFileSync(join(root, "Cargo.lock"), "utf8"));
  const installed = () => spawnSync("wasm-bindgen", ["--version"], { encoding: "utf8" }).stdout?.trim().split(" ")[1];
  if (installed() !== wanted && process.argv.includes("--install")) run("cargo", ["install", "wasm-bindgen-cli", "--locked", "--version", wanted]);
  const have = installed();
  if (have !== wanted) {
    console.error(`build-wasm: Cargo.lock pins wasm-bindgen ${wanted}, but the wasm-bindgen command is ${have ?? "missing"}.`);
    console.error(`Install it with:  cargo install wasm-bindgen-cli --locked --version ${wanted}   (or pass --install)`);
    process.exit(1);
  }

  run("cargo", ["build", "-p", "slides-wasm", "--target", "wasm32-unknown-unknown", "--release", "--locked"]);
  run("wasm-bindgen", ["target/wasm32-unknown-unknown/release/slides_wasm.wasm", "--target", "web", "--out-dir", OUT, "--out-name", "slides_wasm"]);
  writeFileSync(join(root, STAMP), `${fingerprint}\n`);
  // Rust and the editor's code must agree: a name the editor imports and the Rust does not export
  // is a mistake in the sources, and no rebuild fixes it.
  const missing = missingExports(root);
  if (missing.length > 0) {
    console.error(`build-wasm: the build does not export ${missing.join(", ")}, which packages/slides-wasm/ts imports. Export it from packages/slides-wasm/src or stop importing it.`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
