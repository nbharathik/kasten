// Notes dragged from the sidebar, the library, search or the inbox: onto a
// whiteboard, into a pane, or into a project.

import type { DragEvent } from "react";

/** The data type notes carry while dragged: vault paths, one per line. */
export const NOTE_DRAG = "application/x-kasten-notes";

/** The notes being dragged from this window, while they are. A drop target
 * cannot read a drag's data before the drop; this says what is coming. */
let dragging: readonly string[] | null = null;

/** Starts dragging these notes: a board copies them in, a pane opens
 * them, a project takes them in. */
export function dragNotes(event: DragEvent, paths: readonly string[]): void {
  event.dataTransfer.setData(NOTE_DRAG, paths.join("\n"));
  event.dataTransfer.setData("text/plain", paths.join("\n"));
  event.dataTransfer.effectAllowed = "all";
  dragging = paths;
  window.addEventListener("dragend", () => (dragging = null), { once: true, capture: true });
}

/** The notes being dragged from this window, or null when the drag came
 * from elsewhere (and its notes are known only on drop). */
export function draggedNotes(): readonly string[] | null {
  return dragging;
}

/** Whether a drag carries notes; the paths themselves are readable only on drop. */
export function carriesNotes(event: DragEvent): boolean {
  return event.dataTransfer.types.includes(NOTE_DRAG);
}

/** The dragged notes' paths, on drop. */
export function droppedNotes(event: DragEvent): string[] {
  return event.dataTransfer
    .getData(NOTE_DRAG)
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Highlights dragged from the Highlights view or a reader: each becomes
 * its highlight card where it is dropped. */
export const HIGHLIGHT_DRAG = "application/x-kasten-highlights";

export interface DraggedHighlight {
  source: string;
  id: string;
}

export function dragHighlights(event: DragEvent, highlights: readonly DraggedHighlight[]): void {
  event.dataTransfer.setData(HIGHLIGHT_DRAG, JSON.stringify(highlights));
  event.dataTransfer.setData("text/plain", highlights.map((h) => `${h.source}#${h.id}`).join("\n"));
  event.dataTransfer.effectAllowed = "copy";
}

export function carriesHighlights(event: DragEvent): boolean {
  return event.dataTransfer.types.includes(HIGHLIGHT_DRAG);
}

/** The dragged highlights, on drop; anything malformed is left out. */
export function droppedHighlights(event: DragEvent): DraggedHighlight[] {
  try {
    const list: unknown = JSON.parse(event.dataTransfer.getData(HIGHLIGHT_DRAG) || "[]");
    return Array.isArray(list) ? list.filter((h): h is DraggedHighlight => typeof h?.source === "string" && typeof h?.id === "string") : [];
  } catch {
    return [];
  }
}
