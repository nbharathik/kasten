// Highlights share one palette: a page's highlights, the colour
// menu's swatches and a PDF's marker ink. Every colour keeps one lightness
// and strength, so none shouts, and the PDF ink is a page's light highlight.
// These checks keep later edits from drifting apart again.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { KIND_COLORS, kindColor } from "../features/library/kind-tile";
import { NOTION_COLORS } from "../features/pages/editor/blocks/color";
import { HIGHLIGHT_COLORS } from "../lib/vault/source-types";

/** The app's sources; the tests run from `app/`. */
const SRC = [join(process.cwd(), "src"), join(process.cwd(), "app", "src")].find((dir) => existsSync(join(dir, "main.tsx")))!;
const read = (path: string) => readFileSync(join(SRC, path), "utf8");

const STYLES = read("styles.css");
const DARK = STYLES.slice(STYLES.indexOf(':root[data-theme="dark"]'));
const SOURCES = read("features/sources/colors.css");
const EDITOR = read("features/pages/editor/styles/tokens.css");

/** A custom property's value, the first in `css`. */
function value(css: string, name: string): string {
  const found = new RegExp(`${name}:\\s*([^;]+);`).exec(css);
  if (!found) throw new Error(`${name} is not set`);
  return found[1]!.trim();
}

/** `rgb(r g b)` or `#rrggbb` as OKLCH lightness and chroma. */
function oklch(css: string): { L: number; C: number } {
  const hex = /^#([0-9a-f]{6})$/i.exec(css);
  const rgb = hex ? [0, 2, 4].map((i) => parseInt(hex[1]!.slice(i, i + 2), 16)) : /^rgb\((\d+) (\d+) (\d+)\)$/.exec(css)!.slice(1).map(Number);
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, B) };
}

describe("the highlight palette", () => {
  it("gives every editor colour a highlight in light and dark, and uses it", () => {
    for (const color of NOTION_COLORS) {
      expect(value(STYLES, `--color-highlight-${color}`)).toMatch(/^rgb\(/);
      expect(value(DARK, `--color-highlight-${color}`)).toMatch(/^rgb\(/);
      expect(EDITOR).toContain(`.kasten-bg_color-${color} { background: var(--color-highlight-${color}); }`);
    }
  });

  it("gives each kind of note a colour of its own from the palette", () => {
    const colors = Object.values(KIND_COLORS);
    expect(new Set(colors).size).toBe(colors.length);
    for (const color of colors) expect(NOTION_COLORS).toContain(color);
    expect(kindColor("something-new")).toBe("gray");
  });

  it("marks PDFs with a page's own light highlights", () => {
    for (const color of HIGHLIGHT_COLORS) expect(value(SOURCES, `--hl-${color}`)).toBe(value(STYLES, `--color-highlight-${color}`));
  });

  it("keeps every colour at one lightness and strength", () => {
    for (const color of NOTION_COLORS) {
      const light = oklch(value(STYLES, `--color-highlight-${color}`));
      const dark = oklch(value(DARK, `--color-highlight-${color}`));
      expect(light.L).toBeGreaterThan(0.9);
      expect(light.L).toBeLessThan(0.93);
      expect(dark.L).toBeGreaterThan(0.36);
      expect(dark.L).toBeLessThan(0.4);
      if (color === "gray") continue;
      // Brown is a muted colour; yellow needs a little more to read as yellow.
      expect(light.C).toBeGreaterThan(color === "brown" ? 0.02 : 0.04);
      expect(light.C).toBeLessThan(color === "yellow" ? 0.09 : 0.055);
    }
    for (const color of HIGHLIGHT_COLORS) {
      const swatch = oklch(value(SOURCES, `--swatch-${color}`));
      expect(swatch.C).toBeGreaterThan(0.12);
      expect(swatch.C).toBeLessThan(0.16);
      expect(swatch.L).toBeGreaterThan(0.66);
      expect(swatch.L).toBeLessThan(0.86);
    }
  });
});
