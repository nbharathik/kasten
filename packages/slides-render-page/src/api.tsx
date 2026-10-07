// `window.__render`: the calls the driver makes. A deck is loaded once, then slides, grids, printouts, measures and
// exports are asked for as often as needed; each call leaves the page showing what was asked for, settled.

import { DeckEngine, loadSlides, picturePaths, setReferences } from "@kasten-slides/wasm";
import { SlideView, entryName, exportHtmlPage, pngPages, slidePictures } from "@kasten-slides/react/render-host";
import type { PngScale } from "@kasten-slides/react/render-host";

import { Grid, finalStep, gridLayout, numberOf } from "./grid.tsx";
import { mediaUrl, readMedia } from "./media.ts";
import { measureDeck } from "./measure.ts";
import { type Printout, layOut } from "./print.ts";
import { settle } from "./settle.ts";
import { Stage } from "./stage.tsx";
import type { HtmlResult, LoadInfo, PageOptions, PageRef, PrintChoice, PrintInfo, RenderApi, SlideInfo } from "./types.ts";

/** Bytes as base64 text. */
export function base64(bytes: Uint8Array): string {
  let text = "";
  for (let at = 0; at < bytes.length; at += 0x8000) text += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(text);
}

/** Why a step cannot be shown, in words that say what is possible; null when it can. */
export function stepProblem(index: number, total: number, step: number | null | undefined): string | null {
  if (step === null || step === undefined) return null;
  if (!Number.isInteger(step) || step < 0) return `A step is a whole number from 0, not ${step}.`;
  if (total === 0) return step === 0 ? null : `Slide ${index + 1} has no steps, so there is no step ${step}. Leave the step out to see the slide.`;
  return step > total ? `Slide ${index + 1} has steps 0 to ${total}; there is no step ${step}.` : null;
}

export function createApi(element: HTMLElement): RenderApi {
  const stage = new Stage(element);
  let engine: DeckEngine | null = null;
  let printout: Printout | null = null;
  const ready = loadSlides();

  const opened = (): DeckEngine => {
    if (!engine) throw new Error("No deck is open: load one first.");
    return engine;
  };
  const putAwayPrintout = (): void => {
    printout?.remove();
    printout = null;
  };

  return {
    ready,

    async load(deckText: string, refsBibtex?: string | null): Promise<LoadInfo> {
      await ready;
      // The bibliography belongs to the page, not to a deck: a citation is written from it when it is drawn.
      setReferences(refsBibtex ?? null);
      putAwayPrintout();
      stage.clear();
      engine?.dispose();
      engine = null;
      engine = DeckEngine.open(deckText);
      const { deck } = engine;
      return {
        title: deck.title,
        slides: deck.slides.length,
        size: deck.size,
        outline: deck.slides.map((slide) => ({ id: slide.id, steps: slide.steps ?? 0, hidden: slide.hidden === true, backup: slide.backup === true })),
      };
    },

    async references(bibtex?: string | null): Promise<void> {
      await ready;
      setReferences(bibtex ?? null);
    },

    async slide(index: number, step?: number | null): Promise<SlideInfo> {
      const { deck } = opened();
      putAwayPrintout();
      const slide = deck.slides[index];
      if (!slide) throw new Error(`There is no slide ${index + 1}: the deck has ${deck.slides.length}.`);
      const total = slide.steps ?? 0;
      const problem = stepProblem(index, total, step);
      if (problem) throw new Error(problem);
      const at = step === null || step === undefined ? finalStep(slide) : total > 0 ? step : undefined;
      const shown = deck.slides.filter((s) => !s.hidden).length;
      stage.show(<SlideView deck={deck} slide={slide} number={numberOf(deck, slide)} count={shown} step={at} mode="export" imageUrl={mediaUrl} />, deck.size.w, deck.size.h);
      await settle(element);
      // A photograph is a whole number of pixels: the viewport it is taken in is rounded up.
      return { id: slide.id, index, step: total > 0 ? (at ?? total) : null, steps: total, width: Math.ceil(deck.size.w), height: Math.ceil(deck.size.h) };
    },

    async grid(columns?: number | null, width?: number | null) {
      const { deck } = opened();
      putAwayPrintout();
      const layout = gridLayout(deck.slides.length, deck.size, columns, width);
      stage.show(<Grid deck={deck} layout={layout} imageUrl={mediaUrl} />, layout.width, layout.height);
      await settle(element);
      return { width: layout.width, height: layout.height, columns: layout.columns, slides: deck.slides.length };
    },

    measure() {
      return measureDeck(opened());
    },

    pages(options: PageOptions): PageRef[] {
      const { deck } = opened();
      const current = options.current === undefined || options.current === null ? undefined : deck.slides[options.current]?.id;
      if (options.current !== undefined && options.current !== null && current === undefined) throw new Error(`There is no slide ${options.current + 1}: the deck has ${deck.slides.length}.`);
      const wanted = { scope: options.scope, steps: options.steps, scale: 1 as const };
      return pngPages(deck, wanted, current).map((page) => ({
        index: deck.slides.indexOf(page.slide),
        step: page.step ?? null,
        number: page.number,
        name: entryName(page, deck.slides.length, options.steps === "each"),
      }));
    },

    async print(choice?: PrintChoice): Promise<PrintInfo> {
      const { deck } = opened();
      putAwayPrintout();
      stage.clear();
      printout = await layOut(deck, choice);
      return printout.info;
    },

    unprint: putAwayPrintout,

    async html(name?: string | null): Promise<HtmlResult> {
      const { deck } = opened();
      putAwayPrintout();
      const { file, warnings } = await exportHtmlPage(deck, { imageUrl: mediaUrl, readImage: readMedia }, name ? { name } : {});
      return { name: file.name, html: new TextDecoder().decode(file.bytes), warnings: warnings.map((w) => w.message) };
    },

    async editorPng(index: number, scale: number): Promise<string | null> {
      const { deck } = opened();
      const slide = deck.slides[index];
      if (!slide) throw new Error(`There is no slide ${index + 1}: the deck has ${deck.slides.length}.`);
      putAwayPrintout();
      const images = new Map<string, Uint8Array>();
      for (const path of picturePaths(deck)) {
        const bytes = await readMedia(path);
        if (bytes) images.set(path, bytes);
      }
      try {
        const { pictures } = await slidePictures(deck, { scope: "current", scale: scale as PngScale, steps: "final" }, { images, current: slide.id });
        const first = pictures[0];
        return first ? base64(first.bytes) : null;
      } catch {
        return null;
      }
    },
  };
}
