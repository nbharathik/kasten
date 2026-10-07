// Making a deck from a PowerPoint file: the WebAssembly build of the Slides core reads it, the vault keeps
// its pictures (remembering they came from this file), and the deck is made from the text it gives.

import { importPptx, loadSlides, renamePictures } from "@kasten-slides/wasm";

import type { VaultClient } from "../../lib/vault/types";

/** A deck made from a file. */
export interface ImportedDeck {
  /** Where the deck is in the vault. */
  path: string;
  title: string;
  slides: number;
  pictures: number;
  /** Objects kept as they were, because a deck cannot hold them (a chart, a diagram). */
  kept: number;
  /** Things the import could not do exactly and told about. */
  notes: number;
}

/** The file's name without its ending, to call a deck the file gives no title of its own. */
export function titleFor(file: Pick<File, "name">): string {
  return file.name.replace(/\.pptx?$/i, "").replace(/_+/g, " ").trim() || "Imported presentation";
}

const nameOf = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

/** Reads `file` and makes a deck of it in `project` (the library when null). Throws in words for a person when the file cannot be read. */
export async function importDeck(client: VaultClient, file: File, project: string | null, asked?: string): Promise<ImportedDeck> {
  await loadSlides();
  const wanted = asked?.trim();
  const imported = importPptx(new Uint8Array(await file.arrayBuffer()), { ...(wanted ? { title: wanted } : {}), name: titleFor(file) });
  // What the file calls itself, unless the person named the deck; else the file's name.
  const title = imported.title;
  // The pictures go into the vault first, so the deck never names one that is not there.
  const kept = new Map<string, string>();
  for (const picture of imported.media) {
    const added = await client.addAsset(nameOf(picture.path), picture.bytes, { source: "pptx-import", deck: title });
    kept.set(picture.path, added.path);
  }
  const path = await client.createDeck(title, project, renamePictures(imported.deck, kept));
  const { report } = imported;
  return { path, title, slides: report.slides, pictures: report.pictures, kept: report.raw.length, notes: report.warnings.length };
}

/** What to tell the person once the deck is made. */
export function summary(done: ImportedDeck): string {
  const slides = `${done.slides} ${done.slides === 1 ? "slide" : "slides"}`;
  const kept = done.kept > 0 ? ` ${done.kept} ${done.kept === 1 ? "thing was" : "things were"} kept as ${done.kept === 1 ? "a picture" : "pictures"} and cannot be edited here.` : "";
  return `Imported “${done.title}”: ${slides}.${kept}`;
}
