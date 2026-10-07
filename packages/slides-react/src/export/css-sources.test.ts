// @vitest-environment node

import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";

// The exported page takes the renderer's rules from the page it is made in (slide-css.ts), by the names of the classes they are for.
// A stylesheet of the renderer that names other things would be left out of every export. This fails when one is added.

const SRC = join(import.meta.dirname, "..");
const SLIDE_SELECTOR = /\.ks-(?:slide|text)\b/;

function files(dir: string, into: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files(path, into);
    else into.push(path);
  }
  return into;
}

/** The stylesheets that the renderer's and the text module's components import. */
function imported(): string[] {
  const sheets = new Set<string>();
  for (const dir of ["render", "text"]) {
    for (const path of files(join(SRC, dir)).filter((p) => /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p))) {
      for (const match of readFileSync(path, "utf8").matchAll(/^import\s+"(\.[^"]+\.css)"/gm)) sheets.add(join(path, "..", match[1] as string));
    }
  }
  return [...sheets];
}

function selectors(css: string): string[] {
  const bare = css.replaceAll(/\/\*[\s\S]*?\*\//g, "").replaceAll(/@import[^;]*;/g, "");
  const found: string[] = [];
  for (const block of bare.split("}")) {
    const head = block.split("{")[0]?.trim() ?? "";
    if (head === "" || head.startsWith("@")) continue;
    found.push(...head.split(",").map((s) => s.trim()));
  }
  return found.filter(Boolean);
}

describe("the stylesheets of the renderer", () => {
  const sheets = imported();

  it("are found", () => {
    expect(sheets.map((s) => basename(s)).sort()).toEqual(expect.arrayContaining(["SlideView.css", "fonts.css", "text.css", "math.css"]));
  });

  it("only have rules that are for the slide or its text, which is how an export finds them", () => {
    for (const sheet of sheets) {
      for (const selector of selectors(readFileSync(sheet, "utf8"))) {
        expect(selector, `${sheet}: ${selector}`).toMatch(SLIDE_SELECTOR);
      }
    }
  });
});
