// macOS and Windows file systems ignore case, so `./Board` and `./board`
// are one file there: two modules whose names differ only in case break
// the build on those systems while passing on Linux.

import { readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const MODULE = /\.(tsx?|jsx?|mts)$/;

function clashes(dir: string): string[] {
  const found: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  const byName = new Map<string, string[]>();
  for (const entry of entries) {
    if (entry.isDirectory()) {
      found.push(...clashes(join(dir, entry.name)));
      continue;
    }
    if (!MODULE.test(entry.name)) continue;
    // What an import names: the file without its extension (and without
    // .test, which is never imported).
    const key = entry.name.replace(MODULE, "").toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), entry.name]);
  }
  for (const names of byName.values()) {
    const stems = new Set(names.map((n) => n.replace(MODULE, "")));
    if (stems.size > 1) found.push(`${dir}: ${names.join(", ")}`);
  }
  return found;
}

describe("source file names", () => {
  it("never differ only in case", () => {
    expect(clashes(join(__dirname, ".."))).toEqual([]);
  });
});
