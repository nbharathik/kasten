import type { Changes, Deck, Slide } from "./generated/index.ts";

/**
 * The deck with `changes` applied, sharing every slide that did not change
 * with the deck it came from, so views that compare slides by identity skip
 * them. The Rust side does the same in `Changes::apply_to`.
 */
export function applyChanges(deck: Deck, changes: Changes): Deck {
  let slides: Slide[] = deck.slides;
  const touched = Object.entries(changes.slides);
  if (touched.length > 0) {
    slides = [...slides];
    for (const [id, slide] of touched) {
      const at = slides.findIndex((s) => s.id === id);
      if (slide) {
        if (at >= 0) slides[at] = slide;
        else slides.push(slide);
      } else if (at >= 0) {
        slides.splice(at, 1);
      }
    }
  }
  if (changes.order) {
    const byId = new Map(slides.map((s) => [s.id, s]));
    slides = changes.order.flatMap((id) => {
      const slide = byId.get(id);
      return slide ? [slide] : [];
    });
  }
  const next: Deck = { ...deck, slides };
  if (changes.theme) next.theme = changes.theme;
  if (changes.meta) {
    next.title = changes.meta.title;
    next.size = changes.meta.size;
    next.present = changes.meta.present;
    if (changes.meta.sections.length > 0) next.sections = changes.meta.sections;
    else delete next.sections;
  }
  return next;
}
