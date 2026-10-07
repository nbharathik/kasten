// The pen the draw tool uses: its width and colour, remembered
// for the next board.

import type { BoardController } from "./controller";

export interface Pen {
  size: number;
  /** A board colour, or null for the ink's. */
  color: string | null;
}

/** The pen widths offered: fine, medium, bold, marker. */
export const PEN_SIZES = [2, 4, 7, 12] as const;

const PEN_KEY = "kasten.board.pen";
const DEFAULT_PEN: Pen = { size: 4, color: null };

export function savedPen(): Pen {
  try {
    const saved = JSON.parse(localStorage.getItem(PEN_KEY) ?? "null") as Partial<Pen> | null;
    const size = PEN_SIZES.find((s) => s === saved?.size) ?? DEFAULT_PEN.size;
    const color = typeof saved?.color === "string" && /^([1-6]|#[0-9a-f]{6})$/i.test(saved.color) ? saved.color : null;
    return { size, color };
  } catch {
    return DEFAULT_PEN;
  }
}

export function setPen(board: BoardController, pen: Partial<Pen>): void {
  const next = { ...board.store.getState().pen, ...pen };
  board.store.setState({ pen: next });
  try {
    localStorage.setItem(PEN_KEY, JSON.stringify(next));
  } catch {
    // A convenience only.
  }
}
