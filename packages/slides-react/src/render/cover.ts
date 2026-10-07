// Posters. The picture of an embedded page or a video is drawn to fill its box
// without being stretched: cropped at the sides or at the top and bottom, as
// `object-fit: cover` does. The expansion of the composite cannot say how much
// to crop, since it does not know how big the picture is, but the browser does,
// so the expansion only marks the picture (`fit: "cover"`) and the renderer crops it.

import type { Element } from "@kasten-slides/wasm";

/** What marks a picture that fills its box like a poster: a field of the image the model does not list, kept by whatever reads and writes the deck. */
export interface Cover {
  fit: "cover";
}

/** Whether an element is a picture that fills its box like a poster. */
export const isCover = (element: Element): boolean => element.type === "image" && (element as Element & Partial<Cover>).fit === "cover";
