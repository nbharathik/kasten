// Pictures given to the drawer itself: chosen, dropped on it, or pasted into
// it. They are kept by the host and listed; nothing is put on the slide.

import { readImage } from "../files.ts";
import type { SlidesHost } from "../host.ts";

const pad = (n: number) => String(n).padStart(2, "0");

/** The name a pasted picture is kept under: screenshots arrive nameless or all called `image.png`. */
export function pastedName(file: { name: string; type: string }, now: Date): string {
  const name = file.name.trim();
  if (name && !/^image\.\w+$/i.test(name)) return name;
  const ext = /\.(\w+)$/.exec(name)?.[1] ?? file.type.split("/")[1]?.replace("jpeg", "jpg").replace(/\+.*$/, "") ?? "png";
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `Pasted image ${stamp}.${ext}`;
}

/**
 * Keeps each file with the host, as pasted or as a file. Resolves to the path each has, in order: a picture kept
 * before comes back as the path it has, so pasting the same picture twice gives one image. A file the host
 * refuses is left out and named in `refused`.
 */
export async function keepFiles(host: SlidesHost, files: File[], source: "pasted" | "file", now = new Date()): Promise<{ paths: string[]; refused: string[] }> {
  const paths: string[] = [];
  const refused: string[] = [];
  for (const file of files) {
    try {
      const read = await readImage(file);
      paths.push(await host.addImage(source === "pasted" ? pastedName(file, now) : read.name, read.bytes, { source }));
    } catch (error) {
      refused.push(`${file.name || "A picture"}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { paths, refused };
}

/** The pictures on the system clipboard, if the browser lets the page read it (it asks the person the first time); none otherwise. */
export async function clipboardPictures(): Promise<File[]> {
  try {
    const items = (await navigator.clipboard?.read?.()) ?? [];
    const files: File[] = [];
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith("image/"));
      if (type) files.push(new File([await item.getType(type)], `image.${type.split("/")[1]?.replace("jpeg", "jpg").replace(/\+.*$/, "") || "png"}`, { type }));
    }
    return files;
  } catch {
    // Not allowed, or nothing there that can be read: the text on the clipboard is pasted as before.
    return [];
  }
}
