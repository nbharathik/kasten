// A font in a deck is a role of the theme (`heading`, `body`, `code`) or a
// family name a run picked. Either becomes a CSS font-family list: the family,
// what the theme says to fall back on, and a generic family at the end so the
// browser always has something of the right kind.

import type { FontSpec, Theme } from "@kasten-slides/wasm";

const GENERIC = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "math",
  "emoji",
  "fangsong",
]);

const MONOSPACE = /mono|courier|consolas|menlo|monaco|typewriter|\bcode\b/i;
const SERIF = /\bserif\b|georgia|times|cambria|caladea|garamond|palatino|book antiqua|baskerville|bodoni|didot|charter|playfair|merriweather|lora\b/i;

const isRole = (font: string): font is "heading" | "body" | "code" => font === "heading" || font === "body" || font === "code";

/** The generic family that suits a list of families, judging by their names. */
function genericFor(names: readonly string[]): string {
  const all = names.join(" ");
  if (MONOSPACE.test(all)) return "monospace";
  if (SERIF.test(all) && !/sans/i.test(all)) return "serif";
  return "sans-serif";
}

/** A family name as a CSS string; a generic keyword stays bare because quoted it would name a font instead. */
function cssName(name: string): string {
  const lower = name.toLowerCase();
  if (GENERIC.has(lower)) return lower;
  return `"${name.replace(/[\\"]/g, "\\$&")}"`;
}

/** The theme's own entry for a family, so a run that names `Cambria` gets the fallbacks the theme lists for it. */
function entryFor(theme: Theme, font: string): FontSpec {
  if (isRole(font)) return theme.fonts[font];
  const named = Object.values(theme.fonts).find((entry) => entry.family.toLowerCase() === font.toLowerCase());
  return named ?? { family: font };
}

/**
 * The CSS `font-family` value for a deck font: `heading`, `body` or `code`
 * from the theme, or a family name. Names are quoted, generic families are
 * not, and the list always ends in a generic family.
 */
export function fontStack(theme: Theme, font = "body"): string {
  const entry = entryFor(theme, font.trim() === "" ? "body" : font.trim());
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of [entry.family, ...(entry.fallback ?? [])]) {
    const name = raw.replace(/\p{Cc}/gu, " ").trim();
    if (name === "" || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    names.push(name);
  }
  const last = names[names.length - 1];
  const list = names.map(cssName);
  if (last === undefined || !GENERIC.has(last.toLowerCase())) list.push(font === "code" ? "monospace" : genericFor(names));
  return list.join(", ");
}
