// The view onto the canvas: zoom and pan, and the maths between slide units and screen pixels.

import type { Point, Size } from "./geometry.ts";
import { clamp } from "./geometry.ts";

/** Maps slide units to screen pixels: screen = slide * zoom + pan. */
export interface View {
  zoom: number;
  panX: number;
  panY: number;
}

/** The least and most a view can be zoomed. */
export const ZOOM_LIMITS: readonly [number, number] = [0.1, 8];

/**
 * The view that shows all of `content` in `container`, centred, with `padding`
 * pixels to spare on every side. The zoom stays within ZOOM_LIMITS, so the next
 * zoomAt does not jump.
 */
export function fitView(container: Size, content: Size, padding = 24): View {
  const room = { w: Math.max(container.w - 2 * padding, 1), h: Math.max(container.h - 2 * padding, 1) };
  const fit = Math.min(room.w / content.w, room.h / content.h);
  // Content with no size has nothing to fit.
  const zoom = Number.isFinite(fit) && fit > 0 ? clamp(fit, ZOOM_LIMITS[0], ZOOM_LIMITS[1]) : 1;
  return { zoom, panX: (container.w - content.w * zoom) / 2, panY: (container.h - content.h * zoom) / 2 };
}

/** `view` zoomed by `factor` about the screen point `at`, which keeps the same slide point under it. The zoom stays within `limits`. */
export function zoomAt(view: View, at: Point, factor: number, limits: readonly [number, number] = ZOOM_LIMITS): View {
  if (!Number.isFinite(factor) || factor <= 0) return view;
  const zoom = clamp(view.zoom * factor, limits[0], limits[1]);
  const scale = zoom / view.zoom;
  return { zoom, panX: at.x - (at.x - view.panX) * scale, panY: at.y - (at.y - view.panY) * scale };
}

/** `view` slid by (`dx`, `dy`) screen pixels. */
export const panBy = (view: View, dx: number, dy: number): View => ({ ...view, panX: view.panX + dx, panY: view.panY + dy });

/** The slide point under a screen point. */
export const toSlide = (view: View, screen: Point): Point => ({ x: (screen.x - view.panX) / view.zoom, y: (screen.y - view.panY) / view.zoom });

/** The screen point a slide point is drawn at. */
export const toScreen = (view: View, slide: Point): Point => ({ x: slide.x * view.zoom + view.panX, y: slide.y * view.zoom + view.panY });

// A pinch arrives as ctrl + wheel in small steps; a mouse wheel notch is about 100. Both are held to
// one step of at most e^0.2 (about 22%), so a fast flick cannot leap across the whole range.
const PINCH = { limit: 20, speed: 0.01 };
const WHEEL = { limit: 100, speed: 0.002 };

/**
 * The factor for zoomAt from one wheel event: above 1 to zoom in (the wheel
 * turned away, a negative `deltaY`), below 1 to zoom out. `ctrl` is for a pinch
 * or Ctrl+wheel, whose deltas are small.
 */
export function wheelZoomFactor(deltaY: number, ctrl: boolean): number {
  if (!Number.isFinite(deltaY)) return 1;
  const { limit, speed } = ctrl ? PINCH : WHEEL;
  return Math.exp(-clamp(deltaY, -limit, limit) * speed);
}
