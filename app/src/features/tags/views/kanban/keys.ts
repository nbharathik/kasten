// Keys on a focused card. Enter (or Space) opens it, with Ctrl, Shift or Alt
// as a click would; Alt+← / Alt+→ move it to the previous or next column;
// the arrows alone go to the card above, below or beside it. Found through
// the page itself, so the board need not redraw to know where focus is.

import type { KeyboardEvent } from "react";

export type CardKey = { kind: "open" } | { kind: "move"; step: 1 | -1 } | { kind: "focus"; dir: "up" | "down" | "left" | "right" } | null;

const ARROWS: Record<string, "up" | "down" | "left" | "right"> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };

/** What a key on a card asks for, if anything. */
export function cardKey(event: Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">): CardKey {
  const { key, altKey, ctrlKey, metaKey, shiftKey } = event;
  if (key === "Enter" || key === " ") return { kind: "open" };
  const dir = ARROWS[key];
  if (!dir) return null;
  if (altKey && !ctrlKey && !metaKey && !shiftKey) return dir === "left" || dir === "right" ? { kind: "move", step: dir === "left" ? -1 : 1 } : null;
  if (altKey || ctrlKey || metaKey || shiftKey) return null;
  return { kind: "focus", dir };
}

const cardsIn = (column: Element | null) => (column ? [...column.querySelectorAll<HTMLElement>("[data-card]")] : []);

/** Moves focus from `card` to the card above or below it, or to the one at
 * the same height in the nearest column with cards to its side. */
export function focusNear(card: HTMLElement, dir: "up" | "down" | "left" | "right"): void {
  const column = card.closest("[data-column]");
  const here = cardsIn(column);
  const at = here.indexOf(card);
  let next: HTMLElement | undefined;
  if (dir === "up" || dir === "down") next = here[at + (dir === "up" ? -1 : 1)];
  else {
    let side = column;
    do side = dir === "left" ? (side?.previousElementSibling ?? null) : (side?.nextElementSibling ?? null);
    while (side && cardsIn(side).length === 0);
    const there = cardsIn(side);
    next = there[Math.min(Math.max(at, 0), there.length - 1)];
  }
  next?.focus();
}
