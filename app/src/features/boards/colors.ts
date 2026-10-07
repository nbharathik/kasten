// JSON Canvas colours (https://jsoncanvas.org): presets "1" to "6", or any
// "#rrggbb" as written.

/** The presets, in order: red, orange, yellow, green, cyan, purple. */
export const PRESETS: Record<string, { name: string; value: string }> = {
  "1": { name: "Red", value: "#e03e3e" },
  "2": { name: "Orange", value: "#d9730d" },
  "3": { name: "Yellow", value: "#dfab01" },
  "4": { name: "Green", value: "#0f7b6c" },
  "5": { name: "Cyan", value: "#0b6e99" },
  "6": { name: "Purple", value: "#6940a5" },
};

/** The CSS colour for a JSON Canvas colour, or undefined for none. */
export function canvasColor(color: string | undefined): string | undefined {
  if (!color) return undefined;
  return PRESETS[color]?.value ?? (/^#[0-9a-f]{6}$/i.test(color) ? color : undefined);
}
