// A board as a presentation: its sections are the slides, read
// in rows from the top, each row from the left. A section's own sections
// follow it, so a talk can open a chapter and then go through its parts.
// Sections a fold hides are left out; the folded one stays.

import type { Viewport } from "@xyflow/react";

import type { BoardNode } from "../../../../lib/vault/types";
import { area, holds, rectOf, shownRect, type Rect } from "./geometry";
import { hiddenIds } from "./sections";

/** Rows from the top, each read from the left: a section starts a new row
 * when its top is below the middle of the row's first. */
function readingOrder(sections: readonly BoardNode[]): BoardNode[] {
  const byTop = [...sections].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: BoardNode[][] = [];
  for (const section of byTop) {
    const row = rows[rows.length - 1];
    const lead = row?.[0];
    if (row && lead && section.y < lead.y + shownRect(lead).height / 2) row.push(section);
    else rows.push([section]);
  }
  return rows.flatMap((row) => row.sort((a, b) => a.x - b.x));
}

/** The smallest of `sections` holding `item`, if one does. */
function smallestHolding(sections: readonly BoardNode[], item: BoardNode): BoardNode | null {
  let best: BoardNode | null = null;
  for (const section of sections) {
    if (section.id === item.id || !holds(rectOf(section), shownRect(item))) continue;
    if (!best || area(rectOf(section)) < area(rectOf(best))) best = section;
  }
  return best;
}

/** A board's sections in the order they are presented. */
export function slides(nodes: readonly BoardNode[]): BoardNode[] {
  const hidden = hiddenIds(nodes);
  const sections = nodes.filter((n) => n.kind === "group" && !hidden.has(n.id));
  const inside = new Map<string | null, BoardNode[]>();
  for (const section of sections) {
    const parent = smallestHolding(sections, section)?.id ?? null;
    inside.set(parent, [...(inside.get(parent) ?? []), section]);
  }
  const out: BoardNode[] = [];
  const visit = (parent: string | null) => {
    for (const section of readingOrder(inside.get(parent) ?? [])) {
      out.push(section);
      visit(section.id);
    }
  };
  visit(null);
  return out;
}

/** Where to start: the section selected, or the smallest one holding the
 * first thing selected, else the first slide. */
export function startAt(deck: readonly BoardNode[], selected: readonly BoardNode[]): number {
  const first = selected[0];
  if (!first) return 0;
  const own = deck.findIndex((s) => s.id === first.id);
  if (own >= 0) return own;
  const holder = smallestHolding(deck, first);
  return holder ? deck.indexOf(holder) : 0;
}

/** The view that shows `rect` whole and centred on a screen `width` ×
 * `height`, with `padding` (a share of the slide) around it. */
export function fitRect(rect: Rect, width: number, height: number, padding = 0.05, maxZoom = 2, minZoom = 0.05): Viewport {
  const w = Math.max(rect.width, 1) * (1 + 2 * padding);
  const h = Math.max(rect.height, 1) * (1 + 2 * padding);
  const zoom = Math.min(maxZoom, Math.max(minZoom, Math.min(width / w, height / h)));
  return { x: width / 2 - (rect.x + rect.width / 2) * zoom, y: height / 2 - (rect.y + rect.height / 2) * zoom, zoom };
}
