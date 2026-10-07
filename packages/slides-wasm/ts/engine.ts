// The typed way into slides-core in the browser. The generated glue in
// ../pkg (built by scripts/build-wasm.mjs) is imported here and in references.ts, and nowhere else.

import init, { type InitInput, SlidesEngine, expandElement, formatVersion, readingOrder as orderOf, specs, themeNames, warmUp as warm } from "../pkg/slides_wasm.js";
import { applyChanges } from "./changes.ts";
import { SlidesError } from "./errors.ts";
import { type ExportOptions, type ExportWarning, type PptxExport, packPictures } from "./export.ts";
import type { Changes, Deck, Element, Measures, OpMap, OpName, Probe, Report, Theme } from "./generated/index.ts";
import { type LintOptions, lintArguments } from "./lint.ts";
import { referencesVersion } from "./references.ts";

let ready: Promise<void> | null = null;

/**
 * Loads the WebAssembly module once. In a browser, call it with no argument:
 * the bundler finds the .wasm file beside the glue code. Where there is no
 * fetch to it (tests, a worker with the bytes at hand), pass the bytes or a
 * compiled module.
 */
export function loadSlides(source?: InitInput | Promise<InitInput>): Promise<void> {
  ready ??= init(source === undefined ? undefined : { module_or_path: source }).then(() => undefined);
  return ready;
}

/** What an operation does: what it returned, and what changed. */
export interface Applied<K extends OpName = OpName> {
  output: OpMap[K]["output"];
  changes: Changes;
}

/** An operation's description for a person or an agent: its purpose and JSON Schemas. */
export interface OpSpec {
  name: OpName;
  about: string;
  input: unknown;
  output: unknown;
}

export type Listener = (deck: Deck, changes: Changes) => void;

const randomSeed = (): number => Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

function guard<T>(run: () => T): T {
  try {
    return run();
  } catch (thrown) {
    throw SlidesError.from(thrown);
  }
}

/**
 * A deck being edited. It keeps a plain copy of the deck up to date from the
 * changes each operation reports, so reading it costs nothing.
 */
export class DeckEngine {
  private readonly raw: SlidesEngine;
  private current: Deck;
  private readonly listeners = new Set<Listener>();

  private constructor(raw: SlidesEngine) {
    this.raw = raw;
    this.current = JSON.parse(guard(() => raw.deck())) as Deck;
  }

  /** A new deck with a title slide. Call `loadSlides` first. */
  static create(title: string, theme = "Light", seed = randomSeed()): DeckEngine {
    return new DeckEngine(guard(() => SlidesEngine.create(title, theme, seed)));
  }

  /** Opens the text of a `.deck` file. Call `loadSlides` first. */
  static open(text: string, seed = randomSeed()): DeckEngine {
    return new DeckEngine(guard(() => SlidesEngine.open(text, seed)));
  }

  /** The deck as it is now. A new object after every change; slides that did not change are the same objects. */
  get deck(): Deck {
    return this.current;
  }

  /** The deck as a Markdown outline: a heading for each slide, its text, and its notes. */
  outline(): string {
    return guard(() => this.raw.outline());
  }

  /** The text to write to the `.deck` file. */
  save(): string {
    return guard(() => this.raw.save());
  }

  /** Calls `listener` after every change made through this engine, undo and redo included. Returns a function that stops it. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private take(changes: Changes): void {
    this.current = applyChanges(this.current, changes);
    for (const listener of this.listeners) listener(this.current, changes);
  }

  /** Applies an operation by name. Throws a `SlidesError` and changes nothing if it cannot be done. */
  apply<K extends OpName>(op: K, input: OpMap[K]["input"]): Applied<K> {
    const applied = JSON.parse(guard(() => this.raw.apply(op, JSON.stringify(input)))) as Applied<K>;
    this.take(applied.changes);
    return applied;
  }

  /** Applies several operations as one step: all take effect or none does, and one undo takes them all back. */
  applyBatch(operations: { [K in OpName]: [K, OpMap[K]["input"]] }[OpName][]): Applied[] {
    const applied = JSON.parse(guard(() => this.raw.applyBatch(JSON.stringify(operations)))) as Applied[];
    if (applied.length > 0) {
      const merged = applied.reduce<Changes>((all, a) => ({ ...all, ...a.changes, slides: { ...all.slides, ...a.changes.slides } }), { slides: {} });
      this.take(merged);
    }
    return applied;
  }

  undo(): Changes | null {
    const text = guard(() => this.raw.undo());
    if (text === undefined || text === null) return null;
    const changes = JSON.parse(text) as Changes;
    this.take(changes);
    return changes;
  }

  redo(): Changes | null {
    const text = guard(() => this.raw.redo());
    if (text === undefined || text === null) return null;
    const changes = JSON.parse(text) as Changes;
    this.take(changes);
    return changes;
  }

  get canUndo(): boolean {
    return this.raw.canUndo();
  }

  get canRedo(): boolean {
    return this.raw.canRedo();
  }

  /** The operation an undo would take back. */
  get undoLabel(): string | undefined {
    return this.raw.undoLabel() ?? undefined;
  }

  get redoLabel(): string | undefined {
    return this.raw.redoLabel() ?? undefined;
  }

  /**
   * The deck as an editable PowerPoint file. `pictures` holds the bytes of the
   * pictures the deck names, by the path it names them with (see `picturePaths`);
   * one that is missing is a grey box and a warning.
   */
  exportPptx(pictures: ReadonlyMap<string, Uint8Array> = new Map(), options: ExportOptions = {}): PptxExport {
    const packed = packPictures(pictures);
    const file = guard(() => this.raw.exportPptx(JSON.stringify(options), packed.names, packed.bytes, packed.lengths));
    try {
      return { bytes: file.bytes, warnings: JSON.parse(file.warnings) as ExportWarning[] };
    } finally {
      file.free();
    }
  }

  /** The works the deck cites, in the order of their numbers: the same list `citationOrder` works out from the deck. */
  citationOrder(): string[] {
    return JSON.parse(guard(() => this.raw.citationOrder())) as string[];
  }

  /** The texts of a slide a page is asked to measure so that lint can tell whether they fit their boxes, as the slide draws them: a citation is the work of the page's bibliography (`setReferences`), not its key. */
  lintProbes(slide: string): Probe[] {
    return JSON.parse(guard(() => this.raw.lintProbes(slide))) as Probe[];
  }

  /** The sizes the engine works out for the texts of a slide, for a page that cannot lay them out: hand them to `lintSlide` as `measures`. */
  lintEstimate(slide: string): Measures {
    return JSON.parse(guard(() => this.raw.lintEstimate(slide))) as Measures;
  }

  /** The problems of one slide. Rules that need what `options` leaves out are named in the report's `skipped`. */
  lintSlide(slide: string, options: LintOptions = {}): Report {
    const [measures, refs] = lintArguments(options);
    return JSON.parse(guard(() => this.raw.lintSlide(slide, measures, refs))) as Report;
  }

  /** The problems of every slide. */
  lintDeck(options: LintOptions = {}): Report {
    const [measures, refs] = lintArguments(options);
    return JSON.parse(guard(() => this.raw.lintDeck(measures, refs))) as Report;
  }

  /** Frees the WebAssembly memory. The engine cannot be used afterwards. */
  dispose(): void {
    this.raw.free();
  }
}

/** Every operation, described. */
export function operationSpecs(): OpSpec[] {
  return JSON.parse(guard(() => specs())) as OpSpec[];
}

/** The built-in themes' names. */
export function builtInThemes(): string[] {
  return JSON.parse(guard(() => themeNames())) as string[];
}

/** The deck format version this build reads and writes. */
export function supportedFormatVersion(): number {
  return formatVersion();
}

/**
 * The order to read boxes in, as places in the list given: rows from top to bottom and each
 * row from left to right. A box that is null (an element with no place) comes last.
 * This is the order `build_steps` takes elements in, so a view that lists them in reading
 * order lists them as a build will take them.
 */
export function readingOrder(boxes: readonly ({ x: number; y: number; w: number; h: number } | null)[]): number[] {
  const flat = boxes.map((box) => (box ? [box.x, box.y, box.w, box.h] : null));
  return JSON.parse(guard(() => orderOf(JSON.stringify(flat)))) as number[];
}

const expansions = new WeakMap<Element, { theme: Theme; layout: string; group: Element | null; version: number; order: readonly string[] | undefined }>();

/**
 * A composite element (code, math, a chat ...) as the group of primitives it is
 * drawn with, in slide coordinates; null for an element that is not a composite
 * or has no box. Kept for as long as the same element object, theme and layout
 * are asked about, so drawing a slide again costs nothing.
 *
 * A citation is written from the page's bibliography (`setReferences`) and, with `order`, numbered as the
 * deck numbers its works (see `citationOrder`); a citation drawn again after either changes is written again.
 */
export function expandComposite(theme: Theme, layout: string, element: Element, order?: readonly string[]): Element | null {
  const cites = element.type === "citation";
  const version = cites ? referencesVersion() : 0;
  const kept = expansions.get(element);
  if (kept && kept.theme === theme && kept.layout === layout && kept.version === version && (!cites || kept.order === order || sameKeys(kept.order, order))) return kept.group;
  const text = guard(() => expandElement(JSON.stringify(theme), layout, JSON.stringify(element), cites && order ? JSON.stringify(order) : undefined));
  const group = text === undefined || text === null ? null : (JSON.parse(text) as Element);
  expansions.set(element, { theme, layout, group, version, order });
  return group;
}

/**
 * Does the slow first-use work of drawing a code block (loading the syntax definitions and building the
 * grammar of Python, the language a new block starts in) on a throw-away snippet, so that the first slide
 * with code that a person opens does not wait for it: from 60 ms on a quiet machine to most of a second
 * on a busy one. Call it when the page is idle, once the module is loaded. It changes nothing, and doing
 * it again costs next to nothing. The other languages still build theirs when a block first uses them.
 */
export function warmUp(): void {
  guard(() => warm());
}

function sameKeys(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  return a !== undefined && b !== undefined && a.length === b.length && a.every((key, i) => key === b[i]);
}
