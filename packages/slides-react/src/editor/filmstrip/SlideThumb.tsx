import type { Deck, Slide } from "@kasten-slides/wasm";
import { type JSX, memo, useCallback, useMemo } from "react";

import { SlideView } from "../../render/index.ts";
import type { ImageUrl } from "../../render/index.ts";
import type { EditorSession } from "../session/session.ts";
import { thumbHeight } from "./model.ts";
import "./thumb.css";

export interface SlideThumbProps {
  /** What a slide is drawn with besides its own content: the deck's theme, size and slide-number setting. */
  deck: Deck;
  slide: Slide;
  /** The slide's place in the deck, from 1, and the number of slides: what a slide number field says. */
  number: number;
  count: number;
  /** The width it is drawn at, in CSS pixels. */
  width: number;
  imageUrl: ImageUrl;
}

function Thumb({ deck, slide, number, count, width, imageUrl }: SlideThumbProps): JSX.Element {
  const scale = width / deck.size.w;
  return (
    <div className="ks-thumb" style={{ width, height: thumbHeight(deck.size, width) }}>
      <SlideView
        deck={deck}
        slide={slide}
        number={number}
        count={count}
        mode="thumbnail"
        imageUrl={imageUrl}
        style={{ position: "absolute", left: 0, top: 0, transform: `scale(${scale})`, transformOrigin: "0 0" }}
      />
    </div>
  );
}

/** Whether two thumbnails would be drawn the same. Only the parts of the deck a slide is drawn with count. */
function same(a: SlideThumbProps, b: SlideThumbProps): boolean {
  return (
    a.slide === b.slide &&
    a.deck.theme === b.deck.theme &&
    a.deck.size.w === b.deck.size.w &&
    a.deck.size.h === b.deck.size.h &&
    a.deck.present.slideNumbers === b.deck.present.slideNumbers &&
    a.deck.present.stepLabel === b.deck.present.stepLabel &&
    a.number === b.number &&
    a.count === b.count &&
    a.width === b.width &&
    a.imageUrl === b.imageUrl
  );
}

/**
 * A slide drawn small: the slide at its own size, scaled down from the top
 * left into a box of the width asked for. The engine shares the slides that an
 * edit did not touch, so an edit draws again only the thumbnail of the slide
 * it changed.
 */
export const SlideThumb = memo(Thumb, same);

/** The address of an image in the deck, from the host; the same function for as long as the session lasts, so images are not drawn again. */
export function useImageUrl(session: EditorSession): ImageUrl {
  return useCallback((path: string) => session.host.imageUrl(path), [session]);
}

/**
 * The deck to draw thumbnails with. It stays the same object until the theme,
 * the size or the slide-number setting changes, so that views of single slides
 * are not asked to draw again whenever any slide changes.
 */
export function useThumbDeck(deck: Deck): Deck {
  const { theme, size, present } = deck;
  return useMemo(() => deck, [theme, size.w, size.h, present.slideNumbers, present.stepLabel]);
}
