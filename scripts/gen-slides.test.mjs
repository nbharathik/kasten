import assert from "node:assert/strict";
import { test } from "node:test";

import { differences, indexOf } from "./gen-slides.mjs";

test("the index lists every type file once, in a fixed order, and not itself or other files", () => {
  const text = indexOf(["Slide.ts", "Deck.ts", "index.ts", "ops.json", "OpMap.ts", "Base.ts"]);
  assert.equal(
    text,
    ["// Generated from slides-core by scripts/gen-slides.mjs. Do not edit.", 'export type * from "./Base.ts";', 'export type * from "./Deck.ts";', 'export type * from "./OpMap.ts";', 'export type * from "./Slide.ts";', 'export type * from "./serde_json/JsonValue.ts";', ""].join("\n"),
  );
});

test("the order does not depend on the order the files came in", () => {
  assert.equal(indexOf(["b.ts", "a.ts"]), indexOf(["a.ts", "b.ts"]));
});

test("differences names the files that were added, removed or changed", () => {
  const before = new Map([["A.ts", "1"], ["B.ts", "2"], ["C.ts", "3"]]);
  const after = new Map([["A.ts", "1"], ["B.ts", "changed"], ["D.ts", "4"]]);
  assert.deepEqual(differences(before, after), ["B.ts", "C.ts", "D.ts"]);
  assert.deepEqual(differences(before, before), []);
});

test("a snapshot reads the files in folders too, by their path below the folder", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { snapshot } = await import("./gen-slides.mjs");
  const dir = mkdtempSync(join(tmpdir(), "gen-slides-"));
  mkdirSync(join(dir, "serde_json"));
  writeFileSync(join(dir, "A.ts"), "a");
  writeFileSync(join(dir, "serde_json", "JsonValue.ts"), "j");
  assert.deepEqual([...snapshot(dir).entries()].sort(), [["A.ts", "a"], ["serde_json/JsonValue.ts", "j"]]);
  assert.deepEqual([...snapshot(join(dir, "missing")).keys()], []);
});
