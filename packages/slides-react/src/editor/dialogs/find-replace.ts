// Putting words in place of one match. The words around it keep their look:
// only the run the match is in has its text changed, and it keeps its bold,
// size, colour and link.

import type { Element, Text } from "@kasten-slides/wasm";

import type { EditorSession } from "../session/session.ts";
import { json } from "../panels/format/values.ts";
import type { FindMatch } from "./find.ts";

/** The element with this id among these and what they hold. */
function within(list: readonly Element[], id: string): Element | undefined {
  for (const element of list) {
    if (element.id === id) return element;
    const found = element.type === "group" ? within(element.children, id) : undefined;
    if (found) return found;
  }
  return undefined;
}

/** The text with the words of one run changed by `change`; null if there is no such run. */
function withRun(text: Text | null | undefined, paragraph: number, run: number, change: (words: string) => string): Text | null {
  const target = text?.paragraphs[paragraph]?.runs[run];
  if (!text || !target) return null;
  return {
    ...text,
    paragraphs: text.paragraphs.map((p, i) => (i === paragraph ? { ...p, runs: p.runs.map((r, j) => (j === run ? { ...r, t: change(r.t) } : r)) } : p)),
  };
}

/**
 * Replaces the words of `match` with `replacement`, as one step of undo.
 * Resolves to whether it did: not when the deck has changed since the match
 * was found and the words are no longer there.
 */
export function replaceOne(session: EditorSession, match: FindMatch, replacement: string): boolean {
  const slide = session.deck.slides.find((s) => s.id === match.slide);
  if (!slide) return false;
  const swap = (words: string) => words.slice(0, match.index) + replacement + words.slice(match.index + match.length);
  // What is there must still be as long as what was found.
  const fits = (words: string) => words.length >= match.index + match.length;

  if (match.notes) {
    const notes = slide.notes ?? "";
    if (!fits(notes)) return false;
    session.slides.setNotes(swap(notes), slide.id);
    return true;
  }

  const spot = match.spot;
  const holder = spot && within(slide.elements, spot.id);
  if (!spot || !holder) return false;
  const change = (words: string) => (fits(words) ? swap(words) : words);

  if (spot.part === "cell" && holder.type === "table") {
    const cell = holder.rows[spot.row ?? -1]?.cells[spot.cell ?? -1];
    const text = withRun(cell?.text, spot.paragraph, spot.run, change);
    if (!cell || !text) return false;
    const rows = holder.rows.map((row, r) => (r === spot.row ? { ...row, cells: row.cells.map((c, i) => (i === spot.cell ? { ...c, text } : c)) } : row));
    session.elements.patch({ rows: json(rows) }, [holder.id]);
    return true;
  }

  const text = withRun(holder.type === "text" ? holder.text : holder.type === "shape" ? holder.text : holder.type === "connector" ? holder.label : null, spot.paragraph, spot.run, change);
  if (!text) return false;
  if (holder.id === match.element) {
    // A box on the slide itself: the way an editor writes its words.
    session.elements.setText(holder.id, text);
  } else {
    // Inside a group, where the words are written with a patch.
    session.elements.patch({ [spot.part === "label" ? "label" : "text"]: json(text) }, [holder.id]);
  }
  return true;
}
