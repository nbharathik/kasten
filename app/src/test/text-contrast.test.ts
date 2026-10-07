// Text colours read at 4.5:1 or more (WCAG AA) on every surface text sits
// on, in both themes: the page, the panels and the wells behind fields.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = [join(process.cwd(), "src"), join(process.cwd(), "app", "src")].find((dir) => existsSync(join(dir, "main.tsx")))!;
const CSS = readFileSync(join(SRC, "styles.css"), "utf8");

/** The `--color-*` hex values set in the first block that opens with `selector`. */
function tokens(selector: string): Record<string, string> {
  const start = CSS.indexOf(`${selector} {`);
  const block = CSS.slice(start, CSS.indexOf("\n}", start));
  return Object.fromEntries([...block.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6});/g)].map((m) => [m[1]!, m[2]!]));
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

const LIGHT = tokens("@theme static");
const THEMES = { light: LIGHT, dark: { ...LIGHT, ...tokens(':root[data-theme="dark"]') } };

describe("text contrast", () => {
  for (const [theme, colours] of Object.entries(THEMES)) {
    it(`meets AA for ink, muted and faint text in the ${theme} theme`, () => {
      const short: string[] = [];
      for (const text of ["ink", "muted", "faint"]) {
        for (const surface of ["canvas", "panel", "well", "raised"]) {
          const r = ratio(colours[text]!, colours[surface]!);
          if (r < 4.5) short.push(`${text} on ${surface}: ${r.toFixed(2)}`);
        }
      }
      expect(short).toEqual([]);
    });
  }
});
