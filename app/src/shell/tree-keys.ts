// Arrow keys in the sidebar's page tree, as a tree view takes them: Up and
// Down move between the rows shown, Right opens a row or steps into it,
// Left closes it or steps out to the row it is under, Home and End go to
// the first and last row.

import type { KeyboardEvent } from "react";

/** Every row title shown in the tree holding `from`, in order. */
function rowsAround(from: HTMLElement): HTMLElement[] {
  const tree = from.closest("nav") ?? document.body;
  return [...tree.querySelectorAll<HTMLElement>("[data-row-title]")];
}

/** The title of the row `from`'s row sits under, if any. */
function parentRow(from: HTMLElement): HTMLElement | null {
  const item = from.closest("li");
  const outer = item?.parentElement?.closest("li");
  return outer?.querySelector<HTMLElement>(":scope > div [data-row-title]") ?? null;
}

/** The title of the first row inside `from`'s row, if it is open. */
function firstChild(from: HTMLElement): HTMLElement | null {
  return from.closest("li")?.querySelector<HTMLElement>(":scope > ul [data-row-title]") ?? null;
}

/** Handles a key on a row title; true when it was the tree's. */
export function treeKey(event: KeyboardEvent, row: { open: boolean; canOpen: boolean; toggle(): void }): boolean {
  const title = event.target as HTMLElement;
  if (!title.hasAttribute?.("data-row-title") || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  const rows = rowsAround(title);
  const at = rows.indexOf(title);
  const go = (el: HTMLElement | null | undefined) => el?.focus();
  switch (event.key) {
    case "ArrowDown":
      go(rows[at + 1]);
      break;
    case "ArrowUp":
      go(rows[at - 1]);
      break;
    case "Home":
      go(rows[0]);
      break;
    case "End":
      go(rows.at(-1));
      break;
    case "ArrowRight":
      if (row.canOpen && !row.open) row.toggle();
      else if (row.open) go(firstChild(title));
      break;
    case "ArrowLeft":
      if (row.canOpen && row.open) row.toggle();
      else go(parentRow(title));
      break;
    default:
      return false;
  }
  event.preventDefault();
  return true;
}
