import type { SetLayout } from "@kasten-slides/wasm";

import type { EditorSession } from "../../session/session.ts";

/**
 * Puts the slides selected in the filmstrip (or the one shown) on a layout, as
 * one step. Slides already on it are left alone.
 */
export function applyLayout(session: EditorSession, name: string): void {
  const { slideSelection, slideId, deck } = session.state;
  const wanted = slideSelection.length > 1 ? slideSelection : [slideId];
  const changing = wanted.filter((id) => deck.slides.find((slide) => slide.id === id)?.layout !== name);
  const [only] = changing;
  if (only === undefined) return;
  if (changing.length === 1) return session.slides.setLayout(name, only);
  session.run(() => session.core.applyBatch(changing.map((slide) => ["set_layout", { slide, layout: name }] satisfies ["set_layout", SetLayout])));
}
