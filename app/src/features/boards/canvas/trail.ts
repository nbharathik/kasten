// Where you came from and where you were: the boards you went through to
// reach a nested one (the breadcrumb leads back through them), and each
// board's view, so going back up returns to the same spot. Kept for this
// window only.

import type { Viewport } from "@xyflow/react";

const trails = new Map<string, string[]>();
const views = new Map<string, Viewport>();

/** Remembers going from `parent` into `child`. Going into a board already
 * on the way cuts the way back to it. */
export function entered(parent: string, child: string): void {
  const way = [...(trails.get(parent) ?? []), parent];
  const cut = way.indexOf(child);
  trails.set(child, cut >= 0 ? way.slice(0, cut) : way);
}

/** The boards on the way to `path`, outermost first. */
export function trailOf(path: string): string[] {
  return trails.get(path) ?? [];
}

export function rememberView(path: string, view: Viewport): void {
  views.set(path, view);
}

/** How the board was last seen in this window, if it was. */
export function viewOf(path: string): Viewport | undefined {
  return views.get(path);
}

/** Forgets everything (tests). */
export function forgetTrails(): void {
  trails.clear();
  views.clear();
}
