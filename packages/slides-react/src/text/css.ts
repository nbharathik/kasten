// Style objects for slide text, and the one place that turns them into the
// text of a `style` attribute. React draws text with the objects and
// ProseMirror's `toDOM` writes the attribute, so both must agree on what a
// number means.

import type { CSSProperties } from "react";

/** React's style object plus CSS custom properties (`--ks-...`). */
export type Css = CSSProperties & { [custom: `--${string}`]: string | number | undefined };

/** Properties whose numbers are not lengths. */
const UNITLESS = new Set(["lineHeight", "fontWeight", "opacity", "zIndex", "flexGrow", "flexShrink", "order", "zoom", "tabSize"]);

/** A length in CSS pixels, rounded to three decimals so `22 pt` is `29.333px`. */
export function px(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return `${Object.is(rounded, -0) ? 0 : rounded}px`;
}

/** Slide units are CSS pixels; type sizes and spacing in points are 4/3 of them. */
export const ptToPx = (points: number): number => (points * 4) / 3;

/** `fontSize` becomes `font-size`, `WebkitX` becomes `-webkit-x`. */
function kebab(name: string): string {
  if (/^(Webkit|Moz|Ms|O)[A-Z]/.test(name)) return `-${kebab(name.charAt(0).toLowerCase() + name.slice(1))}`;
  if (/^ms[A-Z]/.test(name)) return `-${kebab(name)}`;
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/** Whether a value could end its declaration early: a `;`, `{` or `}` outside of quotes. */
function escapes(value: string): boolean {
  let quote = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value.charAt(i);
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ";" || ch === "{" || ch === "}") return true;
  }
  return quote !== "";
}

/**
 * The text of a `style` attribute for a style object, in kebab case: numbers
 * are pixels except for the unitless properties (`lineHeight`, `fontWeight`,
 * `opacity`), and empty values are left out. A value that could break out of
 * its declaration is dropped rather than written.
 */
export function cssText(props: Css): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === "") continue;
    const custom = key.startsWith("--");
    const text = typeof value === "number" ? (custom || UNITLESS.has(key) ? String(value) : px(value)) : String(value);
    if (escapes(text)) continue;
    parts.push(`${custom ? key : kebab(key)}:${text}`);
  }
  return parts.join(";");
}
