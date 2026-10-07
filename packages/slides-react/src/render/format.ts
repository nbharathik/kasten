// Small helpers the drawing code shares.

/** A number for a path or a style: rounded to two places, without a trailing zero, never `-0`. */
export function num(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded === 0 ? 0 : rounded);
}

export const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

/** Class names that are set, joined. */
export const classes = (...names: (string | false | null | undefined)[]): string => names.filter(Boolean).join(" ");
