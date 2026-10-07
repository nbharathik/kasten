// Colours in a deck are a theme token (`accent2`) or a hex value (`#1a73e8`).
// Everything drawn asks this file what a colour value means, so a deck that
// changes theme restyles itself and nothing outside the theme picks a colour.

import type { Theme } from "@kasten-slides/wasm";

/** The ten names a theme gives its colours. */
export const COLOR_TOKENS = ["text1", "text2", "bg1", "bg2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6"] as const;

export type ColorToken = (typeof COLOR_TOKENS)[number];

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isColorToken(value: string): value is ColorToken {
  return (COLOR_TOKENS as readonly string[]).includes(value);
}

/** `#abc` and `#AABBCC` both become `#aabbcc`; anything else is null. */
function normalHex(value: string): string | null {
  if (!HEX.test(value)) return null;
  const digits = value.slice(1).toLowerCase();
  return digits.length === 3 ? `#${digits.replace(/./g, "$&$&")}` : `#${digits}`;
}

/** The `#rrggbb` a colour value stands for, or null when it is neither a token of the theme nor a hex value. */
export function hexOf(theme: Theme, value: string): string | null {
  return isColorToken(value) ? normalHex(theme.colors[value]) : normalHex(value);
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/**
 * The CSS colour for a deck colour value: a token is looked up in the theme's
 * colours and a hex value is kept. The result is `#rrggbb`, or `rgba(...)`
 * when `alpha` (0 clear, 1 solid) makes it see-through. A value that is
 * neither (which the operations refuse, but a hand-edited file can hold) is
 * drawn in the theme's text colour rather than left to the browser to guess.
 */
export function colorOf(theme: Theme, value: string, alpha?: number | null): string {
  const hex = hexOf(theme, value) ?? hexOf(theme, "text1") ?? "#000000";
  const a = alpha == null || Number.isNaN(alpha) ? 1 : clamp01(alpha);
  if (a >= 1) return hex;
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
}
