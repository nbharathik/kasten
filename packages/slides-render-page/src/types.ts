// What the page tells its driver. The driver (`slides-render`, in Rust, over the browser's DevTools protocol) calls
// `window.__render` and gets these back as JSON, so every value here is plain data.

import type { Measures } from "@kasten-slides/wasm";

/** What `load` says about the deck it opened. */
export interface LoadInfo {
  title: string;
  slides: number;
  /** The slide size in units (1 unit is 1 CSS pixel on the page). */
  size: { w: number; h: number };
  /** Each slide in deck order. */
  outline: { id: string; steps: number; hidden: boolean; backup: boolean }[];
}

/** A slide now on the page (`slide`). */
export interface SlideInfo {
  id: string;
  index: number;
  /** The step drawn; null for a slide without steps. */
  step: number | null;
  /** How many steps the slide has (its last state is this number); 0 for none. */
  steps: number;
  width: number;
  height: number;
}

/** The grid now on the page (`grid`): the size of the picture to take. */
export interface GridInfo {
  width: number;
  height: number;
  columns: number;
  slides: number;
}

/** The printout now on the page (`print`). */
export interface PrintInfo {
  pages: number;
  /** One page's size in CSS pixels, as the print layout sets it. */
  width: number;
  height: number;
}

/** Which pictures a PNG export takes: the pages, each a slide at a step. */
export interface PageOptions {
  scope: "all" | "current";
  steps: "final" | "each";
  /** With `scope: "current"`: the index of the slide. */
  current?: number | null;
}

/** One picture of a PNG export. */
export interface PageRef {
  index: number;
  /** The step; null for a slide without steps (or its last state). */
  step: number | null;
  /** The slide's place among the slides shown, from 1. */
  number: number;
  /** The name of its file in an archive, the editor's: `slide-03.png`, `slide-03-step-2.png`. */
  name: string;
}

export interface PrintChoice {
  steps?: "final" | "each";
  notes?: boolean;
}

/** The HTML export, as text. */
export interface HtmlResult {
  name: string;
  html: string;
  /** What could not go in the page exactly, in words for a person. */
  warnings: string[];
}

export interface RenderApi {
  /** Settles once the page can be given a deck. It rejects, with the reason, when the page cannot start. */
  ready: Promise<void>;
  /**
   * Opens a deck, given as the text of its `.deck` file, and the bibliography beside it (the text of its `.bib` files)
   * if there is one: without one a citation is drawn as its keys, with one as the works they name.
   */
  load(deckText: string, refsBibtex?: string | null): Promise<LoadInfo>;
  /** Gives the page a new bibliography (or none, with null) without opening the deck again; what is drawn next is written from it. */
  references(bibtex?: string | null): Promise<void>;
  /** Draws slide `index` (from 0) at `step` (the last state when left out), at 1 unit to 1 pixel, and waits until it is fit to be photographed. */
  slide(index: number, step?: number | null): Promise<SlideInfo>;
  /** Draws every slide as a labelled thumbnail. `width` is the width of the whole picture in pixels. */
  grid(columns?: number | null, width?: number | null): Promise<GridInfo>;
  /** How big the words of every element come out, for lint. */
  measure(): Promise<Measures>;
  /** The pictures a PNG export of the deck takes. */
  pages(options: PageOptions): PageRef[];
  /** Puts the deck's printout on the page, for the browser to print. */
  print(choice?: PrintChoice): Promise<PrintInfo>;
  /** Takes the printout off the page. */
  unprint(): void;
  /** The deck as the offline web page the HTML export makes. */
  html(name?: string | null): Promise<HtmlResult>;
  /** Slide `index` as the editor's own picture export draws it (an SVG the browser turns into pixels), as base64; null when the browser cannot. */
  editorPng(index: number, scale: number): Promise<string | null>;
}

declare global {
  interface Window {
    __render: RenderApi;
  }
}
