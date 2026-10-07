// A deck to open when there is nothing to open: six slides that use every
// kind of element the editor draws, so a look at the page shows if anything is off.

import type { DeckEngine, Element, Paragraph, Text } from "@kasten-slides/wasm";

const p = (words: string, extra: Partial<Paragraph> = {}): Paragraph => ({ runs: [{ t: words }], ...extra });
const bullet = (words: string, level = 0): Paragraph => p(words, { list: "bullet", level });
const text = (...paragraphs: Paragraph[]): Text => ({ paragraphs });

/** A labelled shape. Labels are 24 pt, so the palette's red and green pass the contrast check (3:1 at that size); yellow takes dark text. */
function box(preset: string, x: number, y: number, w: number, h: number, words: string, fill: string, ink = "bg1"): Element {
  return {
    type: "shape",
    id: "",
    shape: preset,
    x,
    y,
    w,
    h,
    style: { fill: { color: fill }, stroke: { color: "text1", width: 1, alpha: 0.25 } },
    text: { paragraphs: [{ runs: [{ t: words, color: ink, b: true, size: 24 }], align: "center" }], valign: "middle" },
  } as Element;
}

/** Fills the slot elements of a slide (found by role) with rich text. */
function fill(engine: DeckEngine, slide: string, slots: Record<string, Text>): void {
  const deck = engine.deck;
  const target = deck.slides.find((s) => s.id === slide);
  if (!target) return;
  for (const element of target.elements) {
    const body = element.placeholder ? slots[element.placeholder] : undefined;
    if (body) engine.apply("set_rich_text", { slide, id: element.id, text: body });
  }
}

/** Builds the demo deck in `engine`, which should be new (one title slide). */
export function buildDemo(engine: DeckEngine): void {
  engine.apply("set_title", { title: "Tool use in language models" });
  const [first] = engine.deck.slides;
  if (first) fill(engine, first.id, { title: text(p("Tool use in language models")), subtitle: text(p("How a model decides to call a function")) });

  const bullets = engine.apply("add_slide", { layout: "title-body" }).output.slide;
  fill(engine, bullets, {
    title: text(p("Why tools?")),
    body: text(bullet("Models know what they were trained on"), bullet("A tool reaches what they cannot know", 1), bullet("Search, code, files, calendars", 1), bullet("Each call is one turn of a conversation"), bullet("The model asks; the host runs it; the answer comes back", 1)),
  });
  engine.apply("set_notes", { slide: bullets, notes: "Start with a question: what could the model not answer alone?" });

  const diagram = engine.apply("add_slide", { layout: "title-only" }).output.slide;
  fill(engine, diagram, { title: text(p("The loop")) });
  const made = engine.apply("add_elements", {
    slide: diagram,
    elements: [box("roundRect", 90, 200, 220, 90, "Model", "accent1"), box("roundRect", 370, 200, 220, 90, "Host", "accent2"), box("ellipse", 650, 185, 220, 120, "Tool", "accent3", "text1"), box("rightArrow", 90, 340, 780, 60, "Result goes back into the context", "accent4")],
  }).output.ids;
  const [model, host, tool] = made as [string, string, string];
  engine.apply("add_elements", {
    slide: diagram,
    elements: [
      { type: "connector", id: "", x: 0, y: 0, w: 0, h: 0, route: "straight", from: { el: model, side: "right" }, to: { el: host, side: "left" }, style: { stroke: { color: "text1", width: 2 }, endArrow: "triangle" } },
      { type: "connector", id: "", x: 0, y: 0, w: 0, h: 0, route: "elbow", from: { el: host, side: "right" }, to: { el: tool, side: "left" }, style: { stroke: { color: "text1", width: 2 }, endArrow: "triangle" } },
    ] as Element[],
  });

  const columns = engine.apply("add_slide", { layout: "two-columns" }).output.slide;
  fill(engine, columns, {
    title: text(p("Two ways to call")),
    body: text(bullet("Text in, text out"), bullet("Parse the reply yourself", 1), bullet("Fragile, but works anywhere")),
    body2: text(bullet("Structured calls"), bullet("A schema for every tool", 1), bullet("The host checks the arguments", 1)),
  });

  const table = engine.apply("add_slide", { layout: "title-only" }).output.slide;
  fill(engine, table, { title: text(p("What it costs")) });
  const cell = (words: string) => ({ text: text(p(words)) });
  engine.apply("add_elements", {
    slide: table,
    elements: [
      {
        type: "table",
        id: "",
        x: 90,
        y: 170,
        w: 780,
        h: 220,
        columns: [300, 240, 240],
        headerRow: true,
        rows: [
          { height: 44, cells: [cell("Approach"), cell("Latency"), cell("Tokens")] },
          { height: 44, cells: [cell("No tools"), cell("0.8 s"), cell("400")] },
          { height: 44, cells: [cell("One search"), cell("2.1 s"), cell("1 900")] },
          { height: 44, cells: [cell("Three-step plan"), cell("5.6 s"), cell("4 300")] },
        ],
      } as Element,
    ],
  });

  const quote = engine.apply("add_slide", { layout: "quote" }).output.slide;
  fill(engine, quote, { quote: text(p("A tool is a question the model can ask the world.")), caption: text(p("Anonymous")) });
}
