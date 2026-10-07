// How the outline changes a deck: words go in as Markdown through the engine's
// `set_text`, one operation for each change and so one step of undo. Nothing
// else in the outline writes to the deck.

import type { EditorSession } from "../session/session.ts";
import { guardStart, textToMarkdown, titleMarkdown } from "./markdown.ts";
import { bodyElement, titleElement } from "./titles.ts";

export type Field = "title" | "body";

/** Replaces the words of a text with Markdown. Answers whether it was done (the slide or the text may have gone). */
export function setMarkdown(session: EditorSession, slide: string, id: string, markdown: string): boolean {
  const there = session.state.deck.slides.find((s) => s.id === slide)?.elements.some((element) => element.id === id);
  if (!there) return false;
  return session.run(() => session.core.apply("set_text", { slide, id, markdown })) !== undefined;
}

/** The Markdown a slide's title or body holds now, as the outline shows it; empty when the slide has no such text. */
export function readField(session: EditorSession, slide: string, field: Field): string {
  const found = session.state.deck.slides.find((s) => s.id === slide);
  const element = found && (field === "title" ? titleElement(found) : bodyElement(found));
  if (!element) return "";
  return field === "title" ? titleMarkdown(element.text) : textToMarkdown(element.text);
}

/** Words without the space at the ends of the lines or the text, which say nothing. */
const plain = (words: string): string =>
  words
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();

/**
 * Writes what was typed in the title or the body of a slide, unless the slide
 * already says it. A title is one line of Markdown, whose start is kept from
 * being taken for a list.
 */
export function writeField(session: EditorSession, slide: string, id: string, field: Field, typed: string): void {
  const element = session.state.deck.slides.find((s) => s.id === slide)?.elements.find((e) => e.id === id);
  if (!element || element.type !== "text") return;
  const now = field === "title" ? titleMarkdown(element.text) : textToMarkdown(element.text);
  const next = field === "title" ? guardStart(typed.replace(/\s*\n\s*/g, " ")) : typed;
  if (plain(next) === plain(now)) return;
  setMarkdown(session, slide, id, next);
}
