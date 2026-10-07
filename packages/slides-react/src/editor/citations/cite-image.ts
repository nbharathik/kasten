// A figure clipped from a paper remembers the paper's BibTeX key. When the
// figure is put on a slide, the slide should cite the paper: the key goes in the
// slide's footer citation, made along the bottom margin if the slide has none.
// The gallery calls this after each way of placing a picture (double click,
// drop on the slide, drop into an image slot).

import type { Element } from "@kasten-slides/wasm";

import type { HostImage } from "../host.ts";
import type { EditorSession } from "../session/session.ts";

/** The id of a citation on the slide (a footer, not a list of references) that already cites `key`. */
function citing(elements: readonly Element[], key: string): string | undefined {
  for (const element of elements) {
    if (element.type === "citation" && element.format !== "list" && element.keys.includes(key)) return element.id;
    if (element.type === "group") {
      const inside = citing(element.children, key);
      if (inside) return inside;
    }
  }
  return undefined;
}

/**
 * Cites the paper a picture comes from on the shown slide: adds the picture's `citationKey` to the slide's footer citation.
 * Nothing changes for a picture with no key, and none of the slide's citations is asked to take a key it already has, so
 * placing a second figure of the same paper adds no step of undo. What is selected stays selected.
 * Resolves to the id of the citation that holds the key; undefined when there is no key, or the engine refused it (the
 * person is told). It is a step of undo of its own, after the one that placed the picture.
 */
export function citeImage(session: EditorSession, image: Pick<HostImage, "citationKey">): string | undefined {
  const key = image.citationKey?.trim();
  if (!key) return undefined;
  const slide = session.slide;
  const held = citing(slide.elements, key);
  if (held) return held;
  return session.run(() => session.core.apply("add_citation", { slide: slide.id, keys: [key] }))?.output.id;
}
