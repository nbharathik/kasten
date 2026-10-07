// Notion's peeks: a page shown over the view it was picked in, in the
// center (a modal) or at the side, without leaving the view.

import { create } from "zustand";

export type PeekSide = "center" | "side";

export interface Peek {
  path: string;
  mode: PeekSide;
}

interface PeekState {
  peek: Peek | null;
  /** Shows `path`, in `mode` or the mode already open. */
  open(path: string, mode?: PeekSide): void;
  close(): void;
  /** Moves the open peek to the center or the side. */
  setMode(mode: PeekSide): void;
}

export const usePeek = create<PeekState>()((set, get) => ({
  peek: null,
  open(path, mode) {
    set({ peek: { path, mode: mode ?? get().peek?.mode ?? "center" } });
  },
  close() {
    if (get().peek) set({ peek: null });
  },
  setMode(mode) {
    const peek = get().peek;
    if (peek && peek.mode !== mode) set({ peek: { ...peek, mode } });
  },
}));
