// Getting images from the person: a file chooser, and a look at how big a picture is.

import { MIN_SIZE } from "./factory.ts";

/** Opens the system file chooser. Resolves to the files chosen; none if it was dismissed. */
export function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.addEventListener("change", () => resolve([...(input.files ?? [])]));
    input.addEventListener("cancel", () => resolve([]));
    input.click();
  });
}

export interface ReadImage {
  name: string;
  bytes: Uint8Array;
  /** How many pixels wide and high it is, when the browser can tell. */
  size: { w: number; h: number } | null;
}

/** The bytes of an image file, and its size in pixels. */
export async function readImage(file: File): Promise<ReadImage> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return { name: file.name, bytes, size: await measure(file) };
}

async function measure(file: Blob): Promise<{ w: number; h: number } | null> {
  try {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(file);
      const size = { w: bitmap.width, h: bitmap.height };
      bitmap.close();
      return size.w >= 1 && size.h >= 1 ? size : null;
    }
  } catch {
    // Not a picture the browser can open (an SVG without a size, say): fall through.
  }
  return new Promise((resolve) => {
    if (typeof Image === "undefined" || typeof URL.createObjectURL !== "function") return resolve(null);
    try {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image.naturalWidth >= 1 ? { w: image.naturalWidth, h: image.naturalHeight } : null);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      image.src = url;
    } catch {
      // A size that cannot be told is not a reason to lose the picture.
      resolve(null);
    }
  });
}

/** Pictures are placed at their size on screen, but never smaller than the smallest box. */
export const atLeast = (n: number): number => Math.max(MIN_SIZE, Math.round(n));
