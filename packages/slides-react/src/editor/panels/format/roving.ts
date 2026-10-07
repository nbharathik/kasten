// Arrow keys through a list of choices. Only one of them is a stop for Tab (the
// one that is chosen), so a long list is one stop, and the arrows walk it.

import type { KeyboardEvent } from "react";

/**
 * Moves the focus to another option of the list on an arrow key, Home or End.
 * `columns` is how many options make a row when the list is a grid.
 */
export function walkOptions(event: KeyboardEvent<HTMLElement>, columns = 1): void {
  const options = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="option"]')];
  const at = options.findIndex((option) => option === document.activeElement);
  if (at < 0 || options.length === 0) return;
  const last = options.length - 1;
  const to = {
    ArrowDown: Math.min(at + columns, last),
    ArrowUp: Math.max(at - columns, 0),
    ArrowRight: columns > 1 ? Math.min(at + 1, last) : at,
    ArrowLeft: columns > 1 ? Math.max(at - 1, 0) : at,
    Home: 0,
    End: last,
  }[event.key];
  if (to === undefined) return;
  event.preventDefault();
  options[to]?.focus();
}

/** The `tabIndex` of option `i`: the chosen one is the stop for Tab, or the first when none is chosen. */
export const stopAt = (i: number, chosen: number): 0 | -1 => (i === Math.max(chosen, 0) ? 0 : -1);
