// Making a deck in the folder from a PowerPoint file: the WebAssembly build of the Slides core reads it, the folder
// keeps its pictures, and the deck is made through the folder's own way of making one, then filled with the text.

import { importPptx, loadSlides, renamePictures } from "@kasten-slides/wasm";

import type { DeckFile, FolderApi } from "./api.ts";

/** The file's name without its ending, to call a deck the file gives no title of its own. */
export function titleOf(file: Pick<File, "name">): string {
  return file.name.replace(/\.pptx?$/i, "").replace(/_+/g, " ").trim() || "Imported presentation";
}

const nameOf = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

/** A deck made from a file, and what the import said about it. */
export interface Imported {
  deck: DeckFile;
  slides: number;
  /** Objects kept as they were, because a deck cannot hold them. */
  kept: number;
}

/** Reads `file` and makes a deck of it in the folder, in `theme` until the text replaces it. Throws in words for a person when the file cannot be read. */
export async function importDeck(api: FolderApi, file: File, theme: string): Promise<Imported> {
  await loadSlides();
  const imported = importPptx(new Uint8Array(await file.arrayBuffer()), { name: titleOf(file) });
  const title = imported.title;
  // The pictures go into the folder first, so the deck never names one that is not there.
  const kept = new Map<string, string>();
  for (const picture of imported.media) kept.set(picture.path, await api.addAsset(nameOf(picture.path), picture.bytes, "file"));
  const made = await api.create(title, theme);
  const saved = await api.save(made.path, renamePictures(imported.deck, kept), made.hash);
  if (saved.status === "conflict") throw new Error(`The new deck ${made.path} changed while the file was being imported; its text is kept in ${saved.copy}.`);
  return { deck: saved.deck, slides: imported.report.slides, kept: imported.report.raw.length };
}
