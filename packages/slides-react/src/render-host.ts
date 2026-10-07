// What a render host needs from this package, and nothing else: the page a headless browser is pointed at
// (`packages/slides-render-page`, which `slides render` and the agent tools drive) draws slides, lays the deck out for
// printing, makes the HTML export and measures text with the same code the editor uses. This is a narrow entry of its
// own so that such a page does not carry the editor.

import type { Deck } from "@kasten-slides/wasm";

import type { SlidesHost } from "./editor/host.ts";
import type { HtmlExport, HtmlOptions } from "./export/html.ts";

export { SlideView } from "./render/index.ts";
export type { ImageUrl, SlideMode } from "./render/index.ts";
export { slideTitle } from "./editor/dialogs/slide-title.ts";
export { loadMeasurer, measureProbes } from "./editor/lint/measure.ts";
export { DEFAULT_PNG, entryName, pngPages, slidePictures } from "./export/png.ts";
export type { PngOptions, PngResult, PngScale, SlidePicture } from "./export/png.ts";
export { DEFAULT_PRINT, mountPrintLayout, pagesOf } from "./export/print.tsx";
export type { PrintOptions, PrintPage } from "./export/print.tsx";
export type { HtmlExport, HtmlOptions } from "./export/html.ts";

/** The deck as one web page that shows it offline (see `exportHtml`). It is loaded when first wanted: it carries reveal.js. */
export async function exportHtmlPage(deck: Deck, host: Pick<SlidesHost, "imageUrl" | "readImage">, options: HtmlOptions = {}): Promise<HtmlExport> {
  const { exportHtml } = await import("./export/html.ts");
  return exportHtml(deck, host, options);
}
