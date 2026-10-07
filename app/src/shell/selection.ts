// Pages picked in the sidebar, to act on together: from any project, the
// Pages list or a folder. "Select" in a row's menu starts picking; while
// any are picked, a click on a row picks or unpicks it and Shift+click
// picks every row between it and the last one picked. Escape or Done ends
// it. Kept in memory only.

import { create } from "zustand";

interface SidebarSelection {
  /** Picked note paths, in the order picked. */
  picked: string[];
  /** The row a Shift+click range starts from. */
  anchor: string | null;
  /** Picks the row, or unpicks it when it is picked. */
  toggle(path: string): void;
  /** Picks every row from the anchor to `path`, in `order` (the rows as shown). */
  range(path: string, order: readonly string[]): void;
  clear(): void;
}

export const useSidebarSelection = create<SidebarSelection>()((set, get) => ({
  picked: [],
  anchor: null,
  toggle(path) {
    const { picked } = get();
    set(picked.includes(path) ? { picked: picked.filter((p) => p !== path), anchor: path } : { picked: [...picked, path], anchor: path });
  },
  range(path, order) {
    const { anchor, picked } = get();
    const from = anchor ? order.indexOf(anchor) : -1;
    const to = order.indexOf(path);
    if (from < 0 || to < 0) return get().toggle(path);
    const span = order.slice(Math.min(from, to), Math.max(from, to) + 1);
    set({ picked: [...picked, ...span.filter((p) => !picked.includes(p))], anchor: path });
  },
  clear() {
    set({ picked: [], anchor: null });
  },
}));

/** The sidebar's note rows as shown, top to bottom. */
export function rowOrder(): string[] {
  return [...document.querySelectorAll<HTMLElement>('nav[aria-label="Sidebar"] [data-row-path]')].map((el) => el.dataset.rowPath!);
}
