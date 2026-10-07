import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { exportedNames, importedNames, isStale, lockedVersion, missingExports, sourceHash, staleReason } from "./build-wasm.mjs";

test("reads the wasm-bindgen version from Cargo.lock", () => {
  const lock = ['[[package]]', 'name = "wasm-bindgen-futures"', 'version = "0.4.78"', "", '[[package]]', 'name = "wasm-bindgen"', 'version = "0.2.128"', ""].join("\n");
  assert.equal(lockedVersion(lock), "0.2.128");
  assert.equal(lockedVersion('[[package]]\nname = "serde"\nversion = "1.0.0"\n'), null);
});

/** What wasm-bindgen writes for `--target web`, cut down to its export forms. */
const GLUE = [
  "export class SlidesEngine {",
  "}",
  "export function closestReference(key) {",
  "}",
  "export function specs() {",
  "}",
  "export { initSync, __wbg_init as default };",
  "",
].join("\n");

/** A folder laid out like the repository: the Rust behind the build, the code that imports the glue, and a finished build. */
function tree({ glue = GLUE, callers = 'import init, { SlidesEngine, closestReference as closest } from "../pkg/slides_wasm.js";\n' } = {}) {
  const base = mkdtempSync(join(tmpdir(), "build-wasm-"));
  for (const dir of ["crates/slides-core/src", "crates/slides-pptx/src", "packages/slides-wasm/src", "packages/slides-wasm/ts", "packages/slides-wasm/pkg"]) mkdirSync(join(base, dir), { recursive: true });
  for (const file of ["Cargo.toml", "Cargo.lock", "packages/slides-wasm/Cargo.toml"]) writeFileSync(join(base, file), `# ${file}\n`);
  writeFileSync(join(base, "crates/slides-core/src/lib.rs"), "pub fn core() {}\n");
  writeFileSync(join(base, "crates/slides-pptx/src/lib.rs"), "pub fn pptx() {}\n");
  writeFileSync(join(base, "packages/slides-wasm/src/lib.rs"), "pub fn wasm() {}\n");
  writeFileSync(join(base, "packages/slides-wasm/ts/engine.ts"), callers);
  writeFileSync(join(base, "packages/slides-wasm/pkg/slides_wasm.js"), glue);
  writeFileSync(join(base, "packages/slides-wasm/pkg/slides_wasm_bg.wasm"), "");
  return base;
}

/** Records the build the way the script does after a successful one. */
function stamped(base) {
  writeFileSync(join(base, "packages/slides-wasm/pkg/.source-hash"), `${sourceHash(base)}\n`);
  return base;
}

test("a build that was never made is stale", () => {
  const base = mkdtempSync(join(tmpdir(), "build-wasm-"));
  assert.equal(isStale(base), true);
  assert.match(staleReason(base), /not been built/);
});

test("a build made from these sources that has what the editor imports is fresh", () => {
  assert.equal(staleReason(stamped(tree())), null);
});

test("a build with no record of its sources is stale: it may be from any other checkout", () => {
  assert.match(staleReason(tree()), /without a record/);
});

test("a change in any Rust it is made from makes it stale, in slides-core, slides-pptx, slides-wasm or the lock", () => {
  for (const file of ["crates/slides-core/src/lib.rs", "crates/slides-pptx/src/lib.rs", "packages/slides-wasm/src/lib.rs", "Cargo.lock", "packages/slides-wasm/Cargo.toml"]) {
    const base = stamped(tree());
    writeFileSync(join(base, file), "changed\n");
    assert.match(staleReason(base) ?? "", /has changed/, file);
  }
});

test("file times do not matter, only contents: a checkout touches every file", () => {
  const base = stamped(tree());
  for (const file of ["Cargo.lock", "crates/slides-core/src/lib.rs"]) utimesSync(join(base, file), 9_000_000_000, 9_000_000_000);
  assert.equal(staleReason(base), null);
});

test("tests, build folders and files that are not Rust or manifests are not part of the fingerprint", () => {
  const base = stamped(tree());
  const before = sourceHash(base);
  for (const dir of ["crates/slides-core/target", "crates/slides-core/tests", "crates/slides-core/src/ops/tests"]) mkdirSync(join(base, dir), { recursive: true });
  writeFileSync(join(base, "crates/slides-core/README.md"), "words\n");
  writeFileSync(join(base, "crates/slides-core/target/x.rs"), "fn a() {}\n");
  writeFileSync(join(base, "crates/slides-core/tests/a.rs"), "fn a() {}\n");
  writeFileSync(join(base, "crates/slides-core/src/ops/tests/b.rs"), "fn b() {}\n");
  writeFileSync(join(base, "crates/slides-core/src/ops/tests.rs"), "fn c() {}\n");
  assert.equal(sourceHash(base), before);
});

test("the fingerprint tells two different sources apart even when their sizes match", () => {
  const a = tree();
  const b = tree();
  writeFileSync(join(a, "crates/slides-core/src/lib.rs"), "pub fn x() {}\n");
  writeFileSync(join(b, "crates/slides-core/src/lib.rs"), "pub fn y() {}\n");
  assert.notEqual(sourceHash(a), sourceHash(b));
});

test("reads the names the glue exports", () => {
  assert.deepEqual([...exportedNames(GLUE)].sort(), ["SlidesEngine", "closestReference", "default", "initSync", "specs"]);
});

test("reads the names the editor's code takes from the glue, not the types and not the aliases", () => {
  const source = [
    'import init, { type InitInput, SlidesEngine, expandElement, readingOrder as orderOf } from "../pkg/slides_wasm.js";',
    'import type { Everything } from "../pkg/slides_wasm.js";',
    'import { elsewhere } from "./elsewhere.ts"',
    "import {",
    "  closestReference as closest,",
    "  type Only,",
    "  specs,",
    '} from "../pkg/slides_wasm.js"',
  ].join("\n");
  assert.deepEqual(importedNames(source).sort(), ["SlidesEngine", "closestReference", "default", "expandElement", "readingOrder", "specs"]);
});

test("a build that lacks a name the editor imports is stale, whatever its sources say", () => {
  // The error a person saw: the module does not provide an export named 'closestReference'.
  const base = stamped(tree({ glue: GLUE.replace("export function closestReference(key) {\n}\n", "") }));
  assert.deepEqual(missingExports(base), ["closestReference"]);
  assert.match(staleReason(base), /does not export closestReference/);
});

test("tests of the editor's code may import what the build does not have", () => {
  const base = stamped(tree());
  writeFileSync(join(base, "packages/slides-wasm/ts/engine.test.ts"), 'import { notThere } from "../pkg/slides_wasm.js";\n');
  assert.deepEqual(missingExports(base), []);
});
