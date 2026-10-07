// A real deck in a real session, for the tests of the filmstrip, notes, outline
// and grid. Nothing here is a stand-in: the deck is made by the engine.

import { DeckEngine, type Text } from "@kasten-slides/wasm";

import { newDeck } from "../../test/engine.ts";
import { MemoryHost } from "../memory-host.ts";
import { EditorSession } from "../session/session.ts";
import { EditorUi } from "../ui-state.ts";

export interface DeckOptions {
  /** How many slides the deck has (the first is a title slide, the rest title and body). Default 3. */
  slides?: number;
  /** Sections, each starting at the slide with this place in the deck (from 0). */
  sections?: { title: string; at: number }[];
  /** Places of slides to skip when presenting. */
  hidden?: number[];
  /** Places of slides to make backup slides. */
  backup?: number[];
  /** Options for the session. */
  saveDelay?: number;
}

export interface Made {
  engine: DeckEngine;
  session: EditorSession;
  ui: EditorUi;
  host: MemoryHost;
  errors: string[];
}

/** The ids of the slides now, in order. */
export const idsOf = (session: EditorSession): string[] => session.deck.slides.map((slide) => slide.id);

/** A deck with a title slide and `slides - 1` slides of a title and one point each. */
export async function openDeck(options: DeckOptions = {}): Promise<Made> {
  let engine = await newDeck("Talk");
  const count = options.slides ?? 3;
  if (count > 40) {
    // A long deck is made by copying a slide in the file, which is quicker than asking the engine for each.
    const json = JSON.parse(engine.save()) as { slides: { id: string }[] };
    const first = json.slides[0]!;
    json.slides = Array.from({ length: count }, (_, i) => ({ ...first, id: `s-${i.toString(36).padStart(8, "0")}` }));
    engine.dispose();
    engine = DeckEngine.open(JSON.stringify(json));
  } else {
    for (let i = 1; i < count; i++) {
      engine.apply("add_slide", { layout: "title-body", content: { title: `Slide ${i + 1}`, body: `Point ${i + 1}` } });
    }
  }
  const at = (place: number) => engine.deck.slides[place]!.id;
  for (const place of options.hidden ?? []) engine.apply("set_slide_flags", { ids: [at(place)], hidden: true });
  for (const place of options.backup ?? []) engine.apply("set_slide_flags", { ids: [at(place)], backup: true });
  if (options.sections) {
    const json = JSON.parse(engine.save()) as { sections?: { title: string; startsAt: string }[] };
    json.sections = options.sections.map((section) => ({ title: section.title, startsAt: at(section.at) }));
    engine.dispose();
    engine = DeckEngine.open(JSON.stringify(json));
  }
  const host = new MemoryHost();
  const errors: string[] = [];
  const session = new EditorSession(engine, host, { saveDelay: 5, onError: (message) => errors.push(message) });
  return { engine, session, ui: new EditorUi(), host, errors };
}

/** Whether `set_text` in this build reads Markdown, rather than taking each line as it is. */
export async function parserIsIn(): Promise<boolean> {
  const { session, engine } = await openDeck({ slides: 2 });
  const slide = session.deck.slides[1]!;
  const body = slide.elements.find((e) => e.placeholder === "body")!;
  engine.apply("set_text", { slide: slide.id, id: body.id, markdown: "- probe" });
  const text = (engine.deck.slides[1]!.elements.find((e) => e.id === body.id) as { text: Text }).text;
  return text.paragraphs[0]?.runs[0]?.t === "probe";
}
