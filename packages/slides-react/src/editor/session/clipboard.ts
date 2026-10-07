// Copy, cut and paste of elements. What is copied also goes to the system
// clipboard as text, so it can be pasted into another deck or another window.

import type { Element } from "@kasten-slides/wasm";

import { clickBox, textBox } from "../factory.ts";
import type { EditorSession } from "./session.ts";

const MARK = "kasten-slides:";
/** Slide units a repeated paste steps down and right, so copies do not hide one another. */
const STEP = 12;

/** What `copy` puts on the system clipboard. */
function pack(elements: Element[]): string {
  return MARK + JSON.stringify({ v: 1, elements });
}

/** The elements in text a copy made, or null when the text is anything else. */
export function unpack(text: string | undefined): Element[] | null {
  if (!text?.startsWith(MARK)) return null;
  try {
    const parsed = JSON.parse(text.slice(MARK.length)) as { v?: number; elements?: Element[] };
    return parsed.v === 1 && Array.isArray(parsed.elements) && parsed.elements.length > 0 ? parsed.elements : null;
  } catch {
    return null;
  }
}

export class Clipboard {
  private held: Element[] = [];
  private from = "";
  private pasted = 0;

  constructor(private readonly s: EditorSession) {}

  /** Whether the editor itself holds something to paste. */
  get hasContent(): boolean {
    return this.held.length > 0;
  }

  /**
   * Copies the selection. Resolves to the text to put on the system clipboard.
   * Elements that take their place from the layout are copied with the box
   * they occupy and lose the slot, so they land the same size anywhere.
   */
  copy(ids: readonly string[] = this.s.state.selection): string | null {
    const picked = this.s.elements.find(ids);
    if (picked.length === 0) return null;
    this.held = picked.map((element) => {
      const box = this.s.elements.boxOf(element);
      const { placeholder: _slot, ...rest } = element;
      return structuredClone(box ? ({ ...rest, ...box } as Element) : (rest as Element));
    });
    this.from = this.s.state.slideId;
    this.pasted = 0;
    return pack(this.held);
  }

  /** Copies and then removes. */
  cut(ids: readonly string[] = this.s.state.selection): string | null {
    const text = this.copy(ids);
    if (text) this.s.elements.remove(ids);
    return text;
  }

  /**
   * Pastes what `text` carries (from the system clipboard) or, without it,
   * what was last copied here; plain text becomes a text box. Selects the result.
   */
  paste(text?: string): string[] {
    const elements = unpack(text) ?? (text === undefined || text === pack(this.held) ? this.held : null);
    if (elements && elements.length > 0) {
      const sameSlide = this.s.state.slideId === this.from;
      this.pasted += 1;
      const offset = sameSlide || text !== undefined ? STEP * this.pasted : 0;
      const done = this.s.run(() =>
        this.s.core.apply("paste_elements", { slide: this.s.state.slideId, elements: structuredClone(elements), dx: offset, dy: offset }),
      );
      if (!done) return [];
      this.s.select(done.output.ids);
      return done.output.ids;
    }
    const words = text?.trim();
    if (!words) return [];
    const size = this.s.deck.size;
    const box = clickBox({ x: size.w / 2, y: size.h / 2 }, { w: Math.min(640, size.w - 80), h: 60 });
    return this.s.elements.insert([textBox(box, words)]);
  }
}
