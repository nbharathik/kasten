// Reading a PowerPoint file: the deck and pictures it holds, the runs of slides that repeat each
// other, and how the deck goes into the one being edited. The pictures come back as bytes; the
// host stores them, and the deck's `src` paths are made to match with `renamePictures`.

import { importPptx as read, planImport as plan, similarRuns as runs } from "../pkg/slides_wasm.js";
import { SlidesError } from "./errors.ts";
import type { OpMap, OpName } from "./generated/index.ts";

/** How to read the file. */
export interface ImportOptions {
  /** Starts the ids of everything the import makes: the same file and seed give the same deck. */
  seed?: number;
  /** The deck's title as the person asked for it: it wins over anything in the file. */
  title?: string;
  /** What to call the deck when the file gives no title of its own: the file's name. */
  name?: string;
  /** Keep the marker each slide's notes carried, which a new version of a deck is matched by. */
  markers?: boolean;
}

/** An object the import kept as it was, because a deck cannot hold it: a chart, a diagram ... */
export interface KeptObject {
  slide: string;
  element: string;
  /** What it was, such as `pptx:chart`. */
  original: string;
}

/** Something the import could not do exactly, and what it did instead. */
export interface ImportWarning {
  slide: string | null;
  element: string | null;
  message: string;
}

/** What the import says about the file. */
export interface ImportReport {
  slides: number;
  /** Slides the file marks as hidden. */
  hidden: number;
  pictures: number;
  raw: KeptObject[];
  warnings: ImportWarning[];
}

/** A picture the deck names, with its bytes. */
export interface ImportedPicture {
  /** The path the deck names it by, `assets/...`. */
  path: string;
  bytes: Uint8Array;
}

/** A file read: the text of a `.deck` file, its pictures and the report. */
export interface ImportedPptx {
  /** The deck's title: the one asked for, else the file's own, else `name`. */
  title: string;
  deck: string;
  media: ImportedPicture[];
  report: ImportReport;
}

/** Where imported slides go: after a slide (the end if none is named), in place of the deck, or as a new version of it. */
export type ImportMode = "add" | "replace" | "merge";

/** Operations that make an import, to apply as one step (`DeckEngine.applyBatch`). */
export type PlannedOperation = { [K in OpName]: [K, OpMap[K]["input"]] }[OpName];

/** How an imported deck goes into the deck being edited. */
export interface ImportPlan {
  operations: PlannedOperation[];
  /** The ids the imported slides have once the operations are applied, in deck order. */
  slides: string[];
  /** What the person may want to know about how it was put in. */
  notes: string[];
}

function guard<T>(run: () => T): T {
  try {
    return run();
  } catch (thrown) {
    throw SlidesError.from(thrown);
  }
}

/** Reads the bytes of a `.pptx` file. A file that is not a presentation throws a `SlidesError` that says why. */
export function importPptx(bytes: Uint8Array, options: ImportOptions = {}): ImportedPptx {
  const file = guard(() => read(bytes, JSON.stringify(options)));
  try {
    const names = JSON.parse(file.names) as string[];
    const all = file.bytes;
    const lengths = file.lengths;
    let at = 0;
    const media = names.map((path, i) => {
      const length = lengths[i] ?? 0;
      const picture = { path, bytes: all.slice(at, at + length) };
      at += length;
      return picture;
    });
    return { title: file.title, deck: file.deck, media, report: JSON.parse(file.report) as ImportReport };
  } finally {
    file.free();
  }
}

/** Runs of slides, by their place in the deck (from 0), that follow each other and are builds of one another. */
export function similarRuns(deckText: string): number[][] {
  return JSON.parse(guard(() => runs(deckText))) as number[][];
}

/** How the imported deck (the text of its `.deck` file) goes into the deck being edited (the text of its file). */
export function planImport(existingText: string, importedText: string, mode: ImportMode, after?: string): ImportPlan {
  return JSON.parse(guard(() => plan(existingText, importedText, mode, after))) as ImportPlan;
}

/** The deck's text with the paths of its pictures changed, for a host that stored them under other names. */
export function renamePictures(deckText: string, renamed: ReadonlyMap<string, string>): string {
  if (renamed.size === 0) return deckText;
  const deck = JSON.parse(deckText) as unknown;
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, inner]) => [
          key,
          (key === "src" || key === "image" || key === "preview") && typeof inner === "string" ? (renamed.get(inner) ?? inner) : walk(inner),
        ]),
      );
    }
    return value;
  };
  return `${JSON.stringify(walk(deck), null, 2)}\n`;
}
