// Dragging an image out of the drawer: what travels with the drag, and how the
// slide tells it from files dragged in from the computer.

import type { DragEvent } from "react";

import type { HostImage } from "../host.ts";

/** The type the drag carries; a page that is not an editor of ours ignores it. */
export const IMAGE_MIME = "application/x-kasten-slides-image";

/** The part of an image that goes along with a drag. */
export type Dragged = Pick<HostImage, "path" | "name" | "width" | "height" | "caption" | "citationKey">;

type Transfer = Pick<DragEvent, "dataTransfer">;

/** Starts dragging `image`, with `preview` (the picture in its tile) under the pointer. */
export function startImageDrag(event: Transfer & { currentTarget: EventTarget }, image: HostImage, preview?: Element | null): void {
  const transfer = event.dataTransfer;
  const carried: Dragged = { path: image.path, name: image.name, width: image.width, height: image.height, caption: image.caption, citationKey: image.citationKey };
  transfer.effectAllowed = "copy";
  transfer.setData(IMAGE_MIME, JSON.stringify(carried));
  // A drag lands in another program as its name.
  transfer.setData("text/plain", image.name);
  if (preview instanceof HTMLElement && typeof transfer.setDragImage === "function") transfer.setDragImage(preview, 24, 24);
}

/** Whether an image of the drawer is being dragged (known while it is over the slide, before it is dropped). */
export function hasImageDrag(event: Transfer): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes(IMAGE_MIME);
}

/** Whether files from the computer are being dragged. */
export function hasFileDrag(event: Transfer): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

const textOf = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);
const sizeOf = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined);

/** The image dropped, once it is dropped; null for anything else. Only what has the right kind of value is taken from the drag. */
export function droppedImage(event: Transfer): Dragged | null {
  const text = event.dataTransfer?.getData(IMAGE_MIME);
  if (!text) return null;
  try {
    const found = JSON.parse(text) as Record<string, unknown> | null;
    const path = textOf(found?.path);
    if (!found || !path) return null;
    return {
      path,
      name: textOf(found.name) ?? path,
      width: sizeOf(found.width),
      height: sizeOf(found.height),
      caption: textOf(found.caption),
      citationKey: textOf(found.citationKey),
    };
  } catch {
    return null;
  }
}

/** The pictures among files dragged in or pasted: what the browser calls an image, or is named like one. */
export function pictureFiles(files: Iterable<File>): File[] {
  return [...files].filter((file) => file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(file.name));
}
