// Zooming the whole window, as a browser does with Ctrl+= and Ctrl+-: the
// app's webview is scaled, so every view grows or shrinks together. The
// level is kept for this window; the browser preview scales the page.

import { getCurrentWebview } from "@tauri-apps/api/webview";

import { inTauri } from "./api";

const KEY = "kasten.zoom";
/** The levels Ctrl+= and Ctrl+- step through. */
export const LEVELS = [0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const;

export function zoomLevel(): number {
  try {
    const kept = Number(localStorage.getItem(KEY));
    return LEVELS.includes(kept as (typeof LEVELS)[number]) ? kept : 1;
  } catch {
    return 1;
  }
}

/** The level one step in `direction` from `level`, or 1 for 0. */
export function stepZoom(level: number, direction: -1 | 0 | 1): number {
  if (direction === 0) return 1;
  const at = LEVELS.findIndex((l) => l >= level);
  const here = at < 0 ? LEVELS.length - 1 : at;
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, here + direction))]!;
}

/** Scales the window to `level`. */
export async function applyZoom(level: number): Promise<void> {
  if (inTauri()) await getCurrentWebview().setZoom(level);
  else document.documentElement.style.setProperty("zoom", level === 1 ? "" : String(level));
}

/** Zooms in, out or back to 100%, keeps the level and says it. */
export async function zoomBy(direction: -1 | 0 | 1): Promise<number> {
  const level = stepZoom(zoomLevel(), direction);
  try {
    localStorage.setItem(KEY, String(level));
  } catch {
    // The window starts at 100% next time.
  }
  await applyZoom(level);
  return level;
}
