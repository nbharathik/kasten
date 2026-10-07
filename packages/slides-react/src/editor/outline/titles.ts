// Which words on a slide are its title and its body, for the outline.

import type { Element, Slide } from "@kasten-slides/wasm";

export type TextElement = Extract<Element, { type: "text" }>;

const isText = (element: Element): element is TextElement => element.type === "text";

/** The title: the text in the `title` slot, or failing that the first text on the slide. */
export function titleElement(slide: Slide): TextElement | undefined {
  return slide.elements.find((element): element is TextElement => isText(element) && element.placeholder === "title") ?? slide.elements.find(isText);
}

/** The body: the text in the `body` slot, or the `subtitle` of an opening slide, or failing those the next text on the slide after the title. */
export function bodyElement(slide: Slide): TextElement | undefined {
  const title = titleElement(slide);
  const others = slide.elements.filter((element): element is TextElement => isText(element) && element !== title);
  return others.find((element) => element.placeholder === "body") ?? others.find((element) => element.placeholder === "subtitle") ?? others[0];
}
