// The app's icons as plain DOM, for the editor's handle and menus, which are
// built without React.

import { lineIconName } from "./glyph";
import { ICONS, type IconName } from "./icons";

const SVG = "http://www.w3.org/2000/svg";

export function iconElement(name: IconName, size = 16, strokeWidth = 1.75): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  const attrs: Record<string, string> = {
    viewBox: "0 0 24 24",
    width: String(size),
    height: String(size),
    fill: "none",
    stroke: "currentColor",
    "stroke-width": String(strokeWidth),
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  };
  for (const [key, value] of Object.entries(attrs)) svg.setAttribute(key, value);
  for (const [tag, parts] of ICONS[name]) {
    const part = document.createElementNS(SVG, tag);
    for (const [key, value] of Object.entries(parts)) part.setAttribute(key, value);
    svg.appendChild(part);
  }
  return svg;
}

/** An icon string (glyph.ts) as DOM: the line icon, or the text as it is. */
export function glyphElement(value: string, size = 16): Node {
  const name = lineIconName(value);
  if (!name) return document.createTextNode(value);
  const svg = iconElement(name, size);
  svg.classList.add("kasten-glyph-line");
  return svg;
}
