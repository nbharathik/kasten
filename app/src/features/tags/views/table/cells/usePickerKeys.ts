// Keys in a picker's search field: the arrows move through its list, Enter
// picks, Escape closes (keys back to the grid), Tab closes and moves on.

import { useState, type KeyboardEvent } from "react";

import type { Move } from "../context";

export interface PickerKeys {
  /** The item the keys are on, or -1 for an empty list. */
  at: number;
  setActive(index: number): void;
  onKeyDown(event: KeyboardEvent<HTMLInputElement>): void;
}

/** `more` handles other keys, returning true when it used one. */
export function usePickerKeys(count: number, pick: (index: number) => void, close: (move?: Move, refocus?: boolean) => void, more?: (event: KeyboardEvent) => boolean): PickerKeys {
  const [active, setActive] = useState(0);
  const at = Math.min(active, count - 1);
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive(count ? (at + step + count) % count : 0);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (at >= 0) pick(at);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(null, true);
    } else if (event.key === "Tab" && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      close(event.shiftKey ? "prev" : "next", true);
    } else if (more?.(event)) {
      event.preventDefault();
    }
  };
  return { at, setActive, onKeyDown };
}
