// JSON Canvas colours: presets "1" to "6" (red, orange, yellow, green,
// cyan, purple; the canvas CSS tunes each for light and dark) or "#rrggbb".

import type { CSSProperties } from "react";

export const PRESETS = [
  { value: "1", name: "Red" },
  { value: "2", name: "Orange" },
  { value: "3", name: "Yellow" },
  { value: "4", name: "Green" },
  { value: "5", name: "Cyan" },
  { value: "6", name: "Purple" },
] as const;

/** A CSS colour for a board colour, or undefined for the default. */
export function cssColor(color: string | undefined | null): string | undefined {
  if (!color) return undefined;
  if (/^[1-6]$/.test(color)) return `var(--board-c${color})`;
  return /^#[0-9a-f]{6}$/i.test(color) ? color : undefined;
}

/** Style that tints a node with its colour (the board styles read `--tint`). */
export function tint(color: string | undefined): CSSProperties | undefined {
  const css = cssColor(color);
  return css ? ({ "--tint": css } as CSSProperties) : undefined;
}

/** The colour's name, for menus and screen readers. */
export function colorName(color: string | undefined | null): string {
  if (!color) return "Default";
  return PRESETS.find((p) => p.value === color)?.name ?? color;
}
