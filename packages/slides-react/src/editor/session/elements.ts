// Element commands: what the canvas, the toolbar and the Arrange menu do to
// the elements on the slide. Each is one engine operation, so each is one step
// of undo.

import type { AlignMode, Arrange, Axis, Element, JsonValue, Text, Transform } from "@kasten-slides/wasm";

import { boxOf } from "../../theme/index.ts";
import type { EditorSession } from "./session.ts";
import type { Box } from "./types.ts";

/** A JSON merge patch: keys to set, and null to remove one. */
export type Patch = { [key: string]: JsonValue };

/** Where an element ended up after a drag: what changed of its box, turn and flips. */
export interface Placement {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  flipH?: boolean;
  flipV?: boolean;
}

const round = (n: number) => Math.round(n * 100) / 100;

export class ElementCommands {
  constructor(private readonly s: EditorSession) {}

  private get slideId(): string {
    return this.s.state.slideId;
  }

  private get chosen(): string[] {
    return [...this.s.state.selection];
  }

  /** The elements on the slide with these ids, in stacking order. */
  find(ids: readonly string[] = this.chosen): Element[] {
    const wanted = new Set(ids);
    return this.s.slide.elements.filter((e) => wanted.has(e.id));
  }

  /** Where an element is on the slide, whether it says so or its layout does. */
  boxOf(element: Element): Box | null {
    return boxOf(this.s.deck.theme, this.s.slide.layout, element);
  }

  /** Adds elements on top of the slide, selects them and puts the pointer tool back. Resolves to their ids. */
  insert(elements: Element[], at?: number): string[] {
    const done = this.s.run(() => this.s.core.apply("add_elements", { slide: this.slideId, elements, ...(at === undefined ? {} : { at }) }));
    if (!done) return [];
    this.s.setTool("select");
    this.s.select(done.output.ids);
    return done.output.ids;
  }

  /** Changes properties with a merge patch. The same patch goes to every element. */
  patch(patch: Patch, ids: readonly string[] = this.chosen): void {
    if (ids.length === 0) return;
    this.s.run(() => this.s.core.apply("patch_elements", { slide: this.slideId, patches: ids.map((id) => ({ id, patch })) }));
  }

  /** Changes looks: fill, stroke, radius, shadow, opacity, arrows. */
  style(style: Patch, ids: readonly string[] = this.chosen): void {
    this.patch({ style }, ids);
  }

  transform(items: Transform[]): void {
    if (items.length > 0) this.s.run(() => this.s.core.apply("transform_elements", { slide: this.slideId, items }));
  }

  /** Applies where a drag left the elements, by id. */
  place(placements: ReadonlyMap<string, Placement>): void {
    // A group is turned by a number of degrees, where other elements are set to an angle.
    const before = new Map(this.find([...placements.keys()]).map((e) => [e.id, e.type === "group" ? (e.rotation ?? 0) : null]));
    this.transform(
      [...placements].map(([id, p]) => ({
        id,
        x: round(p.x),
        y: round(p.y),
        w: round(p.w),
        h: round(p.h),
        ...(p.rotation === undefined ? {} : { rotation: round(p.rotation - (before.get(id) ?? 0)) }),
        ...(p.flipH === undefined ? {} : { flipH: p.flipH }),
        ...(p.flipV === undefined ? {} : { flipV: p.flipV }),
      })),
    );
  }

  /** Moves the selection by `dx`, `dy` slide units. */
  nudge(dx: number, dy: number, ids: readonly string[] = this.chosen): void {
    const items: Transform[] = [];
    for (const element of this.find(ids)) {
      const box = this.boxOf(element);
      if (box && !element.locked) items.push({ id: element.id, x: round(box.x + dx), y: round(box.y + dy) });
    }
    this.transform(items);
  }

  remove(ids: readonly string[] = this.chosen): void {
    if (ids.length > 0) this.s.run(() => this.s.core.apply("delete_elements", { slide: this.slideId, ids: [...ids] }));
  }

  arrange(to: Arrange, ids: readonly string[] = this.chosen): void {
    if (ids.length > 0) this.s.run(() => this.s.core.apply("reorder_elements", { slide: this.slideId, ids: [...ids], to }));
  }

  /** Groups the selection and selects the group. */
  group(ids: readonly string[] = this.chosen): void {
    if (ids.length < 2) return;
    const done = this.s.run(() => this.s.core.apply("group_elements", { slide: this.slideId, ids: [...ids] }));
    if (done) this.s.select([done.output.group]);
  }

  /** Ungroups the selected groups and selects what they held. */
  ungroup(ids: readonly string[] = this.chosen): void {
    const groups = this.find(ids).filter((e) => e.type === "group");
    const freed: string[] = [];
    for (const group of groups) {
      const done = this.s.run(() => this.s.core.apply("ungroup_element", { slide: this.slideId, id: group.id }));
      if (done) freed.push(...done.output.ids);
    }
    if (freed.length > 0) this.s.select(freed);
  }

  align(mode: AlignMode, ids: readonly string[] = this.chosen): void {
    if (ids.length > 1) this.s.run(() => this.s.core.apply("align_elements", { slide: this.slideId, ids: [...ids], mode }));
  }

  distribute(axis: Axis, ids: readonly string[] = this.chosen): void {
    if (ids.length > 2) this.s.run(() => this.s.core.apply("distribute_elements", { slide: this.slideId, ids: [...ids], axis }));
  }

  /** Copies the elements a little down and right and selects the copies. */
  duplicate(ids: readonly string[] = this.chosen): void {
    if (ids.length === 0) return;
    const done = this.s.run(() => this.s.core.apply("duplicate_elements", { slide: this.slideId, ids: [...ids] }));
    if (done) this.s.select(done.output.ids);
  }

  flip(axis: "horizontal" | "vertical", ids: readonly string[] = this.chosen): void {
    this.transform(
      this.find(ids).map((e) => (axis === "horizontal" ? { id: e.id, flipH: !e.flipH } : { id: e.id, flipV: !e.flipV })),
    );
  }

  /** Turns each element by `degrees` clockwise. */
  rotateBy(degrees: number, ids: readonly string[] = this.chosen): void {
    this.transform(this.find(ids).map((e) => ({ id: e.id, rotation: (((e.rotation ?? 0) + degrees) % 360 + 360) % 360 })));
  }

  lock(locked: boolean, ids: readonly string[] = this.chosen): void {
    this.patch({ locked }, ids);
  }

  /**
   * Writes text an editor finished with, unless it is what the element already holds.
   * `slideId` is the slide the box was on when editing began: the person may have moved on since.
   */
  setText(id: string, text: Text, slideId: string = this.slideId): void {
    const element = this.s.deck.slides.find((slide) => slide.id === slideId)?.elements.find((e) => e.id === id);
    if (!element) return;
    const held = element.type === "text" ? element.text : element.type === "shape" ? element.text : element.type === "connector" ? element.label : null;
    if (held && JSON.stringify(held) === JSON.stringify(text)) return;
    this.s.run(() => this.s.core.apply("set_rich_text", { slide: slideId, id, text }));
  }

  /** Finds and replaces across the deck; resolves to how many were replaced. */
  replaceAll(find: string, replace: string, options: { caseSensitive?: boolean; wholeWord?: boolean; includeNotes?: boolean } = {}): number {
    const done = this.s.run(() => this.s.core.apply("replace_all", { find, replace, ...options }));
    return done ? done.output.count : 0;
  }
}
