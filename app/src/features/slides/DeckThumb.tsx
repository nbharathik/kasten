import { SlideView } from "@kasten-slides/react";
import type { Deck } from "@kasten-slides/wasm";
import { memo, useLayoutEffect, useRef, useState } from "react";

import { fileUrl } from "../../lib/vault/file-url";

const imageUrl = (path: string) => fileUrl(path) ?? undefined;

/** A deck's first slide, drawn at the width of the space it is given. */
export const DeckThumb = memo(function DeckThumb({ deck }: { deck: Deck | null }) {
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
  const slide = deck?.slides[0];
  return (
    <div ref={box} className="relative aspect-video w-full overflow-hidden bg-canvas" aria-hidden="true">
      {!deck || !slide ? (
        <div className="grid size-full place-items-center text-12 text-muted">{deck ? "Empty deck" : ""}</div>
      ) : width > 0 ? (
        <div style={{ width: deck.size.w, height: deck.size.h, transform: `scale(${width / deck.size.w})`, transformOrigin: "0 0" }}>
          <SlideView deck={deck} slide={slide} number={1} count={deck.slides.length} mode="thumbnail" imageUrl={imageUrl} />
        </div>
      ) : null}
    </div>
  );
});
