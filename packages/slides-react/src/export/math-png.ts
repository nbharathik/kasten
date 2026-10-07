// Formulas for PowerPoint. A `math` element is drawn by KaTeX in the editor;
// PowerPoint cannot, so the exporter writes it as a picture (the composite's
// expansion is an image named `math/<hash>.png`) and this makes the picture: the
// same markup as the slide shows, drawn by the browser at three times the size.

import { type Deck, type Element, type Theme, expandComposite } from "@kasten-slides/wasm";

import { hasFormula, mathSize, renderMath } from "../render/math.ts";
import { colorOf } from "../theme/index.ts";
import { katexStyles } from "./katex-css.ts";
import { rasterize } from "./raster.ts";

/** How many pixels a picture of a formula has to each unit of the slide. */
export const MATH_SCALE = 3;

/**
 * The rules that place a formula in its box, as `render/elements/math.css` has
 * them for the slide (a test keeps the two the same).
 */
export const MATH_PAGE_CSS = ".ks-math{display:flex;align-items:center;justify-content:center;line-height:1.2;overflow:visible}.ks-math .katex-display{margin:0}";

/** The pictures the expansion of a formula names, with the size each is drawn at: the image parts whose path is `math/<name>.png`. */
export function mathPicturesIn(expansion: Element | null): { name: string; w: number; h: number }[] {
  const found: { name: string; w: number; h: number }[] = [];
  const visit = (element: Element): void => {
    if (element.type === "group") element.children.forEach(visit);
    else if (element.type === "image" && /^math\/[^/]+\.png$/.test(element.src) && element.w != null && element.h != null) found.push({ name: element.src, w: element.w, h: element.h });
  };
  if (expansion) visit(expansion);
  return found;
}

/** The page of a formula: its markup, centred in a box of `w` x `h` units, at the formula's size and colour. Null when there is nothing to draw or KaTeX cannot read it. */
export function mathPage(element: Extract<Element, { type: "math" }>, theme: Theme, w: number, h: number): string | null {
  if (!hasFormula(element.latex)) return null;
  const rendered = renderMath(element.latex, element.inline === true, "html");
  if (!rendered.ok) return null;
  const style = `width:${w}px;height:${h}px;font-size:${mathSize(element.fontSize)}px;color:${colorOf(theme, element.color ?? "text1")}`;
  return `<div class="ks-math" style="${style}">${rendered.html}</div>`;
}

/** What makes a picture of a page of HTML: `rasterize`, and the CSS that page needs. Given by a test, to stand in for the browser. */
export interface MathPictureTools {
  expand?: typeof expandComposite;
  raster?: typeof rasterize;
  styles?: typeof katexStyles;
  scale?: number;
}

/** The formulas of the slide's elements, and of the groups in them. */
function formulasIn(elements: readonly Element[]): Extract<Element, { type: "math" }>[] {
  return elements.flatMap((element) => {
    if (element.type === "group") return formulasIn(element.children);
    return element.type === "math" ? [element] : [];
  });
}

/**
 * A picture for every formula in the deck, by the path the exporter names it
 * with. A formula the browser cannot draw (KaTeX cannot read it, or the canvas
 * will not give its pixels up) is left out, and the exporter writes its LaTeX as
 * text in its place.
 */
export async function mathPictures(deck: Deck, tools: MathPictureTools = {}): Promise<Map<string, Uint8Array>> {
  const { expand = expandComposite, raster = rasterize, styles = katexStyles, scale = MATH_SCALE } = tools;
  const made = new Map<string, Uint8Array>();
  for (const slide of deck.slides) {
    for (const element of formulasIn(slide.elements)) {
      let wanted: ReturnType<typeof mathPicturesIn>;
      try {
        wanted = mathPicturesIn(expand(deck.theme, slide.layout, element));
      } catch {
        continue;
      }
      for (const { name, w, h } of wanted) {
        if (made.has(name)) continue;
        const page = mathPage(element, deck.theme, w, h);
        if (!page) continue;
        const css = await styles(page);
        if (!css) continue;
        const bytes = await raster(page, `${css}\n${MATH_PAGE_CSS}`, w, h, scale);
        if (bytes) made.set(name, bytes);
      }
    }
  }
  return made;
}
