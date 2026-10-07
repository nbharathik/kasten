// The stage: the one place on the page where a slide, a grid or nothing is drawn. Drawing is synchronous, so what
// `show` returns from is on the page (though its fonts and pictures may still be on their way: see `settle`).

import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { type Root, createRoot } from "react-dom/client";

export class Stage {
  private readonly root: Root;

  constructor(readonly element: HTMLElement) {
    this.root = createRoot(element);
  }

  /**
   * Draws `node` on a stage of `width` x `height` pixels. What was there is taken off first, so that a picture
   * is asked for again each time and the driver hears of one that is missing every time, not only the first.
   */
  show(node: ReactNode, width: number, height: number): void {
    this.element.style.width = `${width}px`;
    this.element.style.height = `${height}px`;
    flushSync(() => this.root.render(null));
    flushSync(() => this.root.render(node));
  }

  /** Draws nothing. */
  clear(): void {
    flushSync(() => this.root.render(null));
  }
}
