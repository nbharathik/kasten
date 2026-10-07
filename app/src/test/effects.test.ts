// An effect returns nothing or its cleanup. One written with an expression
// body, `useEffect(() => el.scrollIntoView())`, returns whatever the call
// returns, and newer engines return a Promise from the scroll methods: React
// then calls the Promise as a cleanup, and the view fails with "destroy is
// not a function". So an effect's arrow has a block body, returns a cleanup
// arrow directly, or is `void`.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/** The app's sources; the tests run from `app/`. */
const SRC = [join(process.cwd(), "src"), join(process.cwd(), "app", "src")].find((dir) => existsSync(join(dir, "main.tsx")))!;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** An effect whose arrow has an expression body that is not a cleanup arrow or `void`. */
const EXPRESSION_EFFECT = /\buse(?:Layout|Insertion)?Effect\(\s*\(\)\s*=>(?!\s*(?:\{|\(\)\s*=>|void\b))/g;

describe("effects", () => {
  it("return nothing or a cleanup, never what a call returns", () => {
    const found = sources(SRC).flatMap((path) => {
      const text = readFileSync(path, "utf8");
      return [...text.matchAll(EXPRESSION_EFFECT)].map((m) => `${relative(SRC, path)}:${text.slice(0, m.index).split("\n").length}`);
    });
    expect(found).toEqual([]);
  });
});
