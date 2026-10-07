// Decks for tests: real ones, made by the engine, and a small theme for the
// tests that cannot load the engine.

import type { Deck, DeckEngine, Element, Slide, Theme } from "@kasten-slides/wasm";

import { newDeck } from "../../test/engine.ts";

/** A slide as the engine leaves it after `add_slide`. */
export interface Scene {
  deck: Deck;
  slide: Slide;
  /** The id of the element in each of the layout's slots, by role. */
  slots: Record<string, string>;
}

export interface SceneOptions {
  /** Light, Dark, Serif or Lecture; Light when left out. */
  theme?: string;
  /** Keep the empty elements the engine puts in the layout's slots, instead of clearing the slide. */
  keepSlots?: boolean;
  /** Changes the deck through the engine before the scene is read from it. */
  edit?: (engine: DeckEngine, slide: string) => void;
}

/**
 * A real deck made by the engine, with one slide of the given layout holding
 * `elements` (full elements, each with an id) and nothing else, unless
 * `keepSlots` leaves the layout's own empty ones in.
 */
export async function scene(layout: string, elements: Element[] = [], options: SceneOptions = {}): Promise<Scene> {
  const engine = await newDeck("Test deck", options.theme ?? "Light");
  const added = engine.apply("add_slide", { layout });
  const slideId = added.output.slide;
  if (!options.keepSlots) engine.apply("delete_elements", { slide: slideId, ids: Object.values(added.output.elements) });
  if (elements.length > 0) engine.apply("add_elements", { slide: slideId, elements });
  options.edit?.(engine, slideId);
  const slide = engine.deck.slides.find((s) => s.id === slideId);
  if (!slide) throw new Error("the slide was not added");
  return { deck: engine.deck, slide, slots: added.output.elements };
}

/**
 * The slide with `stepStates` put on the elements named by id (top level only).
 * The engine cannot take them yet, so a test that needs steps adds them to the
 * data it draws, which is all the renderer reads.
 */
export function withStates(slide: Slide, states: Record<string, NonNullable<Element["stepStates"]>>): Slide {
  return { ...slide, elements: slide.elements.map((element) => (states[element.id] ? { ...element, stepStates: states[element.id] } : element)) };
}

/** A shape or text box at a box, for terse tests. */
export const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

export const words = (t: string) => ({ paragraphs: [{ runs: [{ t }] }] });

/** A theme written out by hand, for tests that run where the engine cannot be loaded. */
export function plainTheme(): Theme {
  return {
    name: "Plain",
    colors: {
      text1: "#202124",
      text2: "#5f6368",
      bg1: "#ffffff",
      bg2: "#f1f3f4",
      accent1: "#1a73e8",
      accent2: "#ea4335",
      accent3: "#fbbc04",
      accent4: "#34a853",
      accent5: "#ff6d01",
      accent6: "#46bdc6",
    },
    fonts: {
      heading: { family: "Inter", fallback: ["Arial", "sans-serif"] },
      body: { family: "Inter", fallback: ["Arial", "sans-serif"] },
      code: { family: "Roboto Mono", fallback: ["monospace"] },
    },
    textStyles: { body: { size: 22, color: "text1", font: "body" } },
    layouts: [
      { name: "blank", label: "Blank", placeholders: [] },
      {
        name: "title-image",
        label: "Title + image",
        placeholders: [{ role: "image", kind: "image", x: 500, y: 150, w: 400, h: 300, prompt: "Click to add image" }],
      },
    ],
    dimmedOpacity: 0.25,
    highlight: { color: "accent1", width: 2 },
  };
}

/** A deck of one slide, written out by hand, for tests that run where the engine cannot be loaded. */
export function plainDeck(elements: Element[], layout = "blank"): { deck: Deck; slide: Slide } {
  const slide: Slide = { id: "s-1", layout, elements };
  const deck: Deck = {
    format: "kasten-deck",
    formatVersion: 1,
    id: "d-1",
    title: "Plain",
    size: { w: 960, h: 540 },
    theme: plainTheme(),
    slides: [slide],
    present: { slideNumbers: true, stepLabel: "Step {n} / {total}" },
  };
  return { deck, slide };
}
