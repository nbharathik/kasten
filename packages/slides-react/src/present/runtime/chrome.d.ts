import type { RevealApi } from "reveal.js";

export interface ChromeOptions {
  /** The column and row of a slide by its number, counted from 1; null when there is no such slide. */
  locate?: (number: number) => [number, number] | null;
  /** What Esc does when nothing else is open. */
  onExit?: () => void;
  /** What S does. */
  onPresenter?: () => void;
  /** What F does; the page's own full screen when left out. */
  fullscreen?: () => void;
  /** What the page's own full screen fills. */
  fullscreenTarget?: HTMLElement;
  /** Seconds the line of keys shows at the start (4 when left out, 0 for never). */
  hintSeconds?: number;
}

export interface Chrome {
  destroy(): void;
  laser(on?: boolean): boolean;
  hints(on?: boolean): boolean;
  lightboxOpen(): boolean;
}

/** Gives a running reveal.js the presentation's keys and tools, in `host`, an empty element inside the deck's window. */
export function attachChrome(reveal: RevealApi, host: HTMLElement, options?: ChromeOptions): Chrome;
