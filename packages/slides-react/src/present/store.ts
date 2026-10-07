// Where the audience window is, as the views that draw it read it. reveal.js moves between slides; this holds
// the result, so React redraws only what a move changes.

import type { Position } from "./plan.ts";
import { samePosition } from "./plan.ts";

export interface PresentSnapshot {
  position: Position;
  /** The overview of all slides is up. */
  overview: boolean;
  /** The black screen is up. */
  paused: boolean;
}

export class PresentStore {
  private current: PresentSnapshot;
  private readonly listeners = new Set<() => void>();

  constructor(position: Position) {
    this.current = { position, overview: false, paused: false };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  getSnapshot = (): PresentSnapshot => this.current;

  /** Takes a new state; nothing is told when it is the one held already. Returns whether it changed. */
  set(next: PresentSnapshot): boolean {
    const now = this.current;
    if (samePosition(now.position, next.position) && now.overview === next.overview && now.paused === next.paused) return false;
    this.current = next;
    for (const listener of [...this.listeners]) listener();
    return true;
  }
}
