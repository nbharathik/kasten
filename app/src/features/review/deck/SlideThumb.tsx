// One slide of a deck drawn small, at the width of the space it is given. The
// Slides view's DeckThumb does this for a deck's first slide; the review needs
// any slide, with its own number (a slide number on the slide shows it).

import { SlideView } from "@kasten-slides/react";
import type { Deck, Slide } from "@kasten-slides/wasm";
import { memo, useLayoutEffect, useRef, useState } from "react";

import { fileUrl } from "../../../lib/vault/file-url";

const imageUrl = (path: string) => fileUrl(path) ?? undefined;

interface Props {
  deck: Deck;
  slide: Slide;
  /** The slide's place in its deck, from 1. */
  number: number;
  /** What a screen reader is told the picture is. */
  label: string;
}

export const SlideThumb = memo(function SlideThumb({ deck, slide, number, label }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const read = () => setWidth(element.clientWidth);
    read();
    const watcher = new ResizeObserver(read);
    watcher.observe(element);
    return () => watcher.disconnect();
  }, []);
  return (
    <div ref={box} role="img" aria-label={label} className="relative aspect-video w-full overflow-hidden bg-canvas">
      {width > 0 && (
        <div style={{ width: deck.size.w, height: deck.size.h, transform: `scale(${width / deck.size.w})`, transformOrigin: "0 0" }}>
          <SlideView deck={deck} slide={slide} number={number} count={deck.slides.length} mode="thumbnail" imageUrl={imageUrl} />
        </div>
      )}
    </div>
  );
});
