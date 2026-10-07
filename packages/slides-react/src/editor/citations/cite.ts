// What the citation dialog does: cite works on the shown slide. Each is one operation, so one step of undo.

import type { CitationStyle, Element } from "@kasten-slides/wasm";

import { insertPlaced } from "../insert-composite.ts";
import type { EditorSession } from "../session/session.ts";

/** How big the references slide's list starts, in slide units. */
const LIST_SIZE = { w: 832, h: 340 };

/**
 * Puts the keys in the shown slide's footer citation, making one along the bottom margin if the slide has none, and selects it.
 * The footer keeps its style unless one is given. Resolves to the citation's id, or undefined if it could not be done.
 */
export function citeOnSlide(session: EditorSession, keys: readonly string[], format?: CitationStyle): string | undefined {
  const done = session.run(() => session.core.apply("add_citation", { slide: session.state.slideId, keys: [...keys], ...(format ? { format } : {}) }));
  if (!done) return undefined;
  session.setTool("select");
  session.select([done.output.id]);
  return done.output.id;
}

/**
 * Adds a citation in the list style to the shown slide, in the largest free place, for a references slide. It prints
 * every work the deck cites, in the order of their numbers; `keys` are works to list as well.
 */
export function addReferenceList(session: EditorSession, keys: readonly string[]): string | undefined {
  const element = { type: "citation", id: "", format: "list", keys: [...keys], name: "references" } as Element;
  return insertPlaced(session, element, LIST_SIZE);
}
