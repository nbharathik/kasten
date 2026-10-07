// Putting a PowerPoint file into the deck being edited. The file is read by the WebAssembly build;
// the pictures go to the host; the slides go in as one batch of operations, so a single undo takes
// the whole import back. Similar slides are only ever offered as steps, and done when asked.

import { DeckEngine, type ImportMode, type ImportPlan, type ImportedPptx, type PlannedOperation, importPptx, planImport, renamePictures, similarRuns } from "@kasten-slides/wasm";

import { slideTitle } from "../dialogs/slide-title.ts";
import type { EditorSession } from "./session.ts";

/** A run of slides the import would make that repeat each other: one build, offered as one slide with steps. */
export interface RunOffer {
  /** The slides' ids once the import is in, in deck order. */
  ids: string[];
  titles: string[];
}

/** What putting a file in as `mode` would do, before anything is changed. */
export interface ImportPreview {
  plan: ImportPlan;
  runs: RunOffer[];
}

export interface ImportChoice {
  mode: ImportMode;
  /** For `add`: the slide the new ones go after; the end when absent. */
  after?: string;
  /** The runs the person chose to collapse into steps. */
  collapse?: readonly RunOffer[];
}

/** What an import did. */
export interface ImportDone {
  /** The ids of the slides the import made, in deck order (a collapsed run is its first slide). */
  slides: string[];
  /** What to tell the person about how the file was put in. */
  notes: string[];
}

/** A name to give the imported deck when the file names none: the file's name without its ending. */
export function titleOfFile(name: string): string {
  return name.replace(/\.pptx?$/i, "").replace(/[_]+/g, " ").trim();
}

/** The name a picture is kept under: the last part of its path. */
const nameOf = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

export class Imports {
  constructor(private readonly s: EditorSession) {}

  /** Reads a file. Throws a `SlidesError` in words for a person when it is not a presentation this can read. */
  read(bytes: Uint8Array, fileName: string, mode: ImportMode): ImportedPptx {
    // A new version is matched to the deck by the markers an export puts in the notes.
    return importPptx(bytes, { name: titleOfFile(fileName) || undefined, markers: mode === "merge" });
  }

  /** How the file would go in, and which of its slides repeat each other. */
  preview(imported: ImportedPptx, mode: ImportMode, after?: string): ImportPreview {
    const existing = this.s.core.save();
    const plan = planImport(existing, imported.deck, mode, after);
    // Tried on a copy, so the runs are found among the slides as they would stand.
    const trial = DeckEngine.open(existing);
    try {
      trial.applyBatch(plan.operations);
      const made = new Set(plan.slides);
      const slides = trial.deck.slides;
      const runs = similarRuns(trial.save())
        .map((places) => places.map((at) => slides[at]).filter((slide) => slide !== undefined))
        .filter((run) => run.length > 1 && run.every((slide) => made.has(slide.id)))
        .map((run) => ({ ids: run.map((slide) => slide.id), titles: run.map(slideTitle) }));
      return { plan, runs };
    } finally {
      trial.dispose();
    }
  }

  /**
   * Puts the file in. Its pictures are kept by the host first, and the deck is made to name them as the host does.
   * Resolves to what was done, or to null when an operation was refused (the person has been told, and nothing changed).
   */
  async apply(imported: ImportedPptx, choice: ImportChoice): Promise<ImportDone | null> {
    const { host } = this.s;
    const from = this.s.deck.title;
    const renamed = new Map<string, string>();
    for (const picture of imported.media) {
      renamed.set(picture.path, await host.addImage(nameOf(picture.path), picture.bytes, { source: "pptx-import", deck: from }));
    }
    const deck = renamePictures(imported.deck, renamed);
    const plan = planImport(this.s.core.save(), deck, choice.mode, choice.after);
    const collapse = (choice.collapse ?? []).map((run): PlannedOperation => ["collapse_slides", { slides: run.ids }]);
    const applied = this.s.run(() => this.s.core.applyBatch([...plan.operations, ...collapse]));
    if (!applied) return null;
    const gone = new Set((choice.collapse ?? []).flatMap((run) => run.ids.slice(1)));
    const slides = plan.slides.filter((id) => !gone.has(id));
    const first = slides[0];
    if (first && this.s.deck.slides.some((slide) => slide.id === first)) this.s.goTo(first);
    return { slides, notes: plan.notes };
  }
}
