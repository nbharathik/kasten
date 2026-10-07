// Draws a component to markup and reads it back with jsdom, so a test can ask
// the page questions without a browser.

import type { Text } from "@kasten-slides/wasm";
import { JSDOM } from "jsdom";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

export function draw(ui: ReactElement): Document {
  return new JSDOM(`<!doctype html><body>${renderToStaticMarkup(ui)}</body>`).window.document;
}

/** An inline style as a record: `left:10px;top:5px` is `{ left: "10px", top: "5px" }`. */
export function styleOf(element: Element | null | undefined): Record<string, string> {
  const style: Record<string, string> = {};
  for (const declaration of (element?.getAttribute("style") ?? "").split(";")) {
    const colon = declaration.indexOf(":");
    if (colon > 0) style[declaration.slice(0, colon).trim()] = declaration.slice(colon + 1).trim();
  }
  return style;
}

/** What a `TextBlock` was asked to draw, read from the stand-in in `mock-text-block.tsx`. */
export interface Block {
  /** The id of the element the block is in, if any. */
  el: string | null;
  words: string;
  text: Text;
  baseStyle: string;
  width: number;
  height: number;
  valign?: string;
  insets?: { left: number; top: number; right: number; bottom: number };
  fields?: { slideNumber?: number; slideCount?: number; stepLabel?: string };
  step?: number;
  emptyPrompt?: string;
}

/** The blocks of the slide's own elements, or with `master` also those of the theme's. */
export function blocks(root: ParentNode, master = false): Block[] {
  return [...root.querySelectorAll("[data-testid=text-block]")]
    .filter((node) => master || !node.closest("[data-master]"))
    .map((node) => ({
      ...(JSON.parse(node.getAttribute("data-props") ?? "{}") as Omit<Block, "el" | "words">),
      el: node.closest("[data-el]")?.getAttribute("data-el") ?? null,
      words: node.textContent ?? "",
    }));
}

/** The elements of a slide (`data-el`) by id, top level and nested. */
export function elementsOf(root: ParentNode): Map<string, HTMLElement> {
  return new Map([...root.querySelectorAll<HTMLElement>("[data-el]")].map((node) => [node.getAttribute("data-el") ?? "", node]));
}
