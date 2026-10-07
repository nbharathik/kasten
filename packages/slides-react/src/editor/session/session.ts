// The editor's state, kept beside the engine: which slide is shown, what is
// selected, the tool, and where saving stands. Every change to the deck goes
// through the engine's operations (its undo and its changes are the single
// source of truth); this class only follows them and keeps the selection
// sensible. Views subscribe and read `state`.

import { DeckEngine, type Changes, type Deck, type Slide, SlidesError } from "@kasten-slides/wasm";

import type { SlidesHost } from "../host.ts";
import { Clipboard } from "./clipboard.ts";
import { ElementCommands } from "./elements.ts";
import { Exports } from "./exporting.ts";
import { Imports } from "./importing.ts";
import { MarkCommands } from "./marks.ts";
import { followReferences } from "./references.ts";
import { SaveQueue } from "./save.ts";
import { SlideCommands } from "./slides.ts";
import { StepCommands } from "./steps.ts";
import { TextCommands } from "./text-commands.ts";
import type { EditorState, Tool } from "./types.ts";

export interface SessionOptions {
  /** Milliseconds after the last change before the deck is saved. */
  saveDelay?: number;
  /** Told about an operation that could not be done, in words for a person. */
  onError?: (message: string) => void;
}

type How = "replace" | "add" | "toggle";

const same = <T>(a: readonly T[], b: readonly T[]) => a.length === b.length && a.every((v, i) => v === b[i]);

export class EditorSession {
  readonly host: SlidesHost;
  readonly slides = new SlideCommands(this);
  readonly steps = new StepCommands(this);
  readonly elements = new ElementCommands(this);
  readonly text = new TextCommands(this);
  readonly clipboard = new Clipboard(this);
  readonly exports = new Exports(this);
  readonly imports = new Imports(this);
  readonly marks = new MarkCommands(this);
  private readonly saver: SaveQueue;
  private readonly onError: (message: string) => void;
  private readonly listeners = new Set<() => void>();
  private engine: DeckEngine;
  private stopListening: () => void = () => {};
  private readonly stopReferences: () => void;
  private current: EditorState;
  private revision = 0;
  /** Set while undo or redo runs, so the view can follow what they changed. */
  private replaying: "undo" | "redo" | null = null;

  constructor(engine: DeckEngine, host: SlidesHost, options: SessionOptions = {}) {
    this.engine = engine;
    this.host = host;
    this.onError = options.onError ?? ((message) => host.notify?.(message));
    const first = engine.deck.slides[0];
    this.current = {
      deck: engine.deck,
      slideId: first?.id ?? "",
      selection: [],
      slideSelection: first ? [first.id] : [],
      editing: null,
      tool: "select",
      ...this.history(),
      saving: { status: "saved" },
      revision: 0,
    };
    this.saver = new SaveQueue({
      host,
      text: () => this.engine.save(),
      report: (saving) => this.patch({ saving }),
      delay: options.saveDelay ?? 700,
    });
    // The deck as opened is what the host holds: opening writes nothing.
    this.saver.markClean(engine.save());
    this.listen();
    this.stopReferences = followReferences(host, this.onError);
  }

  // ---- reading

  get state(): EditorState {
    return this.current;
  }

  get deck(): Deck {
    return this.current.deck;
  }

  /** The slide on the canvas. */
  get slide(): Slide {
    return this.current.deck.slides.find((s) => s.id === this.current.slideId) ?? this.current.deck.slides[0]!;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): EditorState => this.current;

  /** The engine, for the commands in this folder. Views use the commands, not this. */
  get core(): DeckEngine {
    return this.engine;
  }

  // ---- state

  /** Merges `changes` into the state and tells the views. */
  patch(changes: Partial<EditorState>): void {
    this.current = { ...this.current, ...changes };
    for (const listener of [...this.listeners]) listener();
  }

  private history() {
    return {
      canUndo: this.engine.canUndo,
      canRedo: this.engine.canRedo,
      undoLabel: this.engine.undoLabel,
      redoLabel: this.engine.redoLabel,
    };
  }

  /** Runs an engine call; a refused operation is reported and answers undefined. */
  run<T>(call: () => T): T | undefined {
    try {
      return call();
    } catch (thrown) {
      const error = SlidesError.from(thrown);
      this.onError(error.message);
      return undefined;
    }
  }

  private listen(): void {
    this.stopListening();
    this.stopListening = this.engine.subscribe((deck, changes) => this.follow(deck, changes));
  }

  /** The engine changed: keep the slide, selection and history in step, and save. */
  private follow(deck: Deck, changes: Changes): void {
    const before = this.current;
    let slideId = before.slideId;
    if (!deck.slides.some((s) => s.id === slideId)) {
      const was = before.deck.slides.findIndex((s) => s.id === slideId);
      slideId = deck.slides[Math.min(Math.max(was, 0), deck.slides.length - 1)]?.id ?? "";
    } else if (this.replaying && !(slideId in changes.slides)) {
      // Undo and redo show what they changed.
      const shown = deck.slides.find((s) => s.id in changes.slides && changes.slides[s.id]);
      if (shown) slideId = shown.id;
    }
    const onSlide = new Set(deck.slides.find((s) => s.id === slideId)?.elements.map((e) => e.id));
    const selection = slideId === before.slideId ? before.selection.filter((id) => onSlide.has(id)) : [];
    const editing = slideId === before.slideId && before.editing && onSlide.has(before.editing) ? before.editing : null;
    const alive = new Set(deck.slides.map((s) => s.id));
    const kept = before.slideSelection.filter((id) => alive.has(id));
    const slideSelection = slideId === before.slideId ? (kept.includes(slideId) ? kept : [slideId, ...kept]) : [slideId];
    this.revision += 1;
    this.patch({
      deck,
      slideId,
      selection: same(selection, before.selection) ? before.selection : selection,
      slideSelection: same(slideSelection, before.slideSelection) ? before.slideSelection : slideSelection,
      editing,
      ...this.history(),
      saving: { status: "unsaved" },
      revision: this.revision,
    });
    this.saver.schedule();
  }

  // ---- navigation and selection

  goTo(slideId: string): void {
    if (slideId === this.current.slideId || !this.current.deck.slides.some((s) => s.id === slideId)) return;
    this.patch({ slideId, selection: [], editing: null, slideSelection: [slideId] });
  }

  /** Moves by `delta` slides (or to the ends with -Infinity / Infinity). */
  goBy(delta: number): void {
    const slides = this.current.deck.slides;
    const at = slides.findIndex((s) => s.id === this.current.slideId);
    const to = Math.min(Math.max(at + delta, 0), slides.length - 1);
    const next = slides[to];
    if (next) this.goTo(next.id);
  }

  /** Selects elements on the slide: `replace` them, `add` to the selection, or `toggle` each. */
  select(ids: readonly string[], how: How = "replace"): void {
    const onSlide = new Set(this.slide.elements.map((e) => e.id));
    const wanted = ids.filter((id) => onSlide.has(id));
    let selection: string[];
    if (how === "replace") selection = wanted;
    else if (how === "add") selection = [...new Set([...this.current.selection, ...wanted])];
    else {
      const chosen = new Set(this.current.selection);
      for (const id of wanted) {
        if (!chosen.delete(id)) chosen.add(id);
      }
      selection = [...chosen];
    }
    if (same(selection, this.current.selection) && this.current.editing === null) return;
    const editing = this.current.editing && selection.length === 1 && selection[0] === this.current.editing ? this.current.editing : null;
    this.patch({ selection, editing, slideSelection: [this.current.slideId] });
  }

  selectAll(): void {
    this.select(this.slide.elements.filter((e) => !e.locked).map((e) => e.id));
  }

  /** Selects slides in the filmstrip; the first (or the one asked for) is shown. */
  selectSlides(ids: readonly string[], show?: string): void {
    const alive = new Set(this.current.deck.slides.map((s) => s.id));
    const chosen = ids.filter((id) => alive.has(id));
    if (chosen.length === 0) return;
    const slideId = show && chosen.includes(show) ? show : chosen[0]!;
    this.patch({
      slideSelection: chosen,
      slideId,
      selection: slideId === this.current.slideId ? this.current.selection : [],
      editing: slideId === this.current.slideId ? this.current.editing : null,
    });
  }

  setTool(tool: Tool): void {
    if (tool !== this.current.tool) this.patch({ tool, editing: tool === "select" ? this.current.editing : null });
  }

  /** Starts editing an element's text, selecting only it. */
  startEditing(id: string): void {
    if (!this.slide.elements.some((e) => e.id === id)) return;
    this.patch({ selection: [id], editing: id, tool: "select" });
  }

  stopEditing(): void {
    if (this.current.editing !== null) this.patch({ editing: null });
  }

  // ---- history

  undo(): void {
    this.replay("undo");
  }

  redo(): void {
    this.replay("redo");
  }

  private replay(direction: "undo" | "redo"): void {
    this.replaying = direction;
    try {
      this.run(() => (direction === "undo" ? this.engine.undo() : this.engine.redo()));
    } finally {
      this.replaying = null;
    }
  }

  // ---- files

  /** Saves now. */
  flush(): Promise<void> {
    return this.saver.flush();
  }

  /** Puts the editor's version in the file even though the file changed. */
  overwrite(): Promise<void> {
    return this.saver.flush({ overwrite: true });
  }

  /**
   * The file changed outside the editor. With nothing unsaved it is taken as
   * it is; with unsaved changes the two are set side by side as a conflict.
   */
  receive(text: string): void {
    if (this.saver.isOwn(text)) return;
    if (this.current.saving.status === "saved") this.load(text);
    else this.patch({ saving: { status: "conflict", theirs: text } });
  }

  /** Replaces the deck with the text of a file (theirs after a conflict, or a change made outside). */
  load(text: string): void {
    const next = this.run(() => DeckEngine.open(text));
    if (!next) return;
    this.stopListening();
    this.engine.dispose();
    this.engine = next;
    this.listen();
    const slideId = next.deck.slides.some((s) => s.id === this.current.slideId) ? this.current.slideId : (next.deck.slides[0]?.id ?? "");
    // What is selected stays selected where it is still on the slide: a change made outside (an assistant's) does not lose the person's place.
    const onSlide = new Set(next.deck.slides.find((s) => s.id === slideId)?.elements.map((e) => e.id));
    const kept = slideId === this.current.slideId ? this.current.selection.filter((id) => onSlide.has(id)) : [];
    this.saver.markClean(text);
    this.host.synced?.(text);
    this.revision += 1;
    this.patch({
      deck: next.deck,
      slideId,
      selection: same(kept, this.current.selection) ? this.current.selection : kept,
      slideSelection: [slideId],
      editing: null,
      ...this.history(),
      saving: { status: "saved" },
      revision: this.revision,
    });
  }

  /** Stops following the engine and writes what is unsaved. */
  async dispose(): Promise<void> {
    this.stopListening();
    this.stopReferences();
    await this.saver.flush();
    this.listeners.clear();
  }
}
