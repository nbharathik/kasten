// The five highlight colours (kasten-core `COLORS`): a marker's ink over
// the page, and a swatch for the menus. Anything else another tool wrote
// shows as yellow.

import { HIGHLIGHT_COLORS, type HighlightColor } from "../../lib/vault/source-types";

export const COLOR_NAMES: Record<HighlightColor, string> = { yellow: "Yellow", green: "Green", blue: "Blue", pink: "Pink", purple: "Purple" };

export const colorOf = (color: string): HighlightColor => ((HIGHLIGHT_COLORS as readonly string[]).includes(color) ? (color as HighlightColor) : "yellow");

export { HIGHLIGHT_COLORS };
