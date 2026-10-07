import type { Element, Slide, Text } from "@kasten-slides/wasm";

const wordsOf = (text: Text | null | undefined): string =>
  (text?.paragraphs ?? [])
    .map((paragraph) => paragraph.runs.map((run) => run.t).join(""))
    .join(" ")
    .trim();

const textIn = (element: Element): string => (element.type === "text" ? wordsOf(element.text) : element.type === "shape" ? wordsOf(element.text) : "");

/** What to call a slide in a list: its title, else the first words on it, else that it has none. */
export function slideTitle(slide: Slide): string {
  const title = slide.elements.find((e) => (e.placeholder === "title" || e.placeholder === "quote" || e.placeholder === "number") && textIn(e) !== "");
  const first = title ?? slide.elements.find((e) => textIn(e) !== "");
  return first ? textIn(first) : "Untitled slide";
}
