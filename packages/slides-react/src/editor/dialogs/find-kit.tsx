// A deck that talks about cats, and helpers to drive the find card, for the tests of find and replace.

import type { DeckEngine, Element, Paragraph, Text } from "@kasten-slides/wasm";
import { fireEvent, screen } from "@testing-library/react";

import { type Kit, mountDialogs } from "./test-kit.tsx";

export const p = (...runs: Paragraph["runs"]): Paragraph => ({ runs });
export const words = (...paragraphs: Paragraph[]): Text => ({ paragraphs });
export const textBox = (text: Text, y = 10): Element => ({ type: "text", id: "", x: 10, y, w: 300, h: 60, text }) as Element;

/** Fills the placeholder of a slide by its role. */
export const fill = (engine: DeckEngine, slide: string, role: string, text: Text) => {
  const target = engine.deck.slides.find((s) => s.id === slide)?.elements.find((e) => e.placeholder === role);
  if (target) engine.apply("set_rich_text", { slide, id: target.id, text });
};

/** Three slides that talk about cats, with a table, a group and notes. */
export function cats(engine: DeckEngine): string[] {
  const [first] = engine.deck.slides.map((s) => s.id) as [string];
  fill(engine, first, "title", words(p({ t: "Cats and dogs" })));
  fill(engine, first, "subtitle", words(p({ t: "About " }, { t: "cat", b: true }, { t: " behaviour" })));
  engine.apply("set_notes", { slide: first, notes: "Remember the cat story." });
  const second = engine.apply("add_slide", { layout: "title-body" }).output.slide;
  fill(engine, second, "title", words(p({ t: "More cats" })));
  fill(engine, second, "body", words(p({ t: "The cat sat. Concat is not cat." })));
  const third = engine.apply("add_slide", { layout: "blank" }).output.slide;
  engine.apply("add_elements", {
    slide: third,
    elements: [
      { type: "table", id: "", x: 10, y: 100, w: 300, h: 60, columns: [150, 150], rows: [{ cells: [{ text: words(p({ t: "cat" })) }, { text: words(p({ t: "Dog" })) }] }] } as Element,
    ],
  });
  const [a, b] = engine.apply("add_elements", { slide: third, elements: [textBox(words(p({ t: "in group: cat" })), 200), textBox(words(p({ t: "cat too" })), 260)] }).output.ids;
  engine.apply("group_elements", { slide: third, ids: [a!, b!] });
  return [first, second, third];
}

export const open = (extra: Parameters<typeof mountDialogs>[0] = {}) => mountDialogs({ dialog: "find", blank: false, prepare: cats, ...extra });
export const find = () => screen.getByLabelText("Find") as HTMLInputElement;
export const replaceField = () => screen.getByLabelText("Replace with") as HTMLInputElement;
export const status = () => screen.getByRole("status").textContent;
export const type = (value: string) => fireEvent.change(find(), { target: { value } });
export const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
export const shown = (kit: Kit) => ({ slide: kit.session.deck.slides.findIndex((s) => s.id === kit.session.state.slideId), selected: kit.session.state.selection });
