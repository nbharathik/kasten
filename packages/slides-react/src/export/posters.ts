// The stills of embedded pages and videos. A PowerPoint file cannot show a live
// page or play a video from a deck, so it gets the still: the exporter writes
// each `poster` as a picture, which means the editor has to hand it the bytes.

import type { Deck } from "@kasten-slides/wasm";

/** The image paths that embed and video elements name as their `poster`, in the order they first appear. */
export function posterPaths(deck: Deck): string[] {
  const found = new Set<string>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
    } else if (value !== null && typeof value === "object") {
      for (const [key, inner] of Object.entries(value)) {
        if (key === "poster" && typeof inner === "string" && inner !== "") found.add(inner);
        else walk(inner);
      }
    }
  };
  walk(deck.slides);
  return [...found];
}
