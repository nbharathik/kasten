// The open board, for everything drawn on it.

import { createContext, useContext } from "react";
import { useStore } from "zustand";

import type { BoardController } from "./state/controller";
import type { BoardState } from "./state/store";

export const BoardContext = createContext<BoardController | null>(null);

export function useBoard(): BoardController {
  const board = useContext(BoardContext);
  if (!board) throw new Error("Not inside a board");
  return board;
}

/** A value from the board's view state; the component redraws when it changes. */
export function useBoardState<T>(selector: (state: BoardState) => T): T {
  return useStore(useBoard().store, selector);
}

/** Below this zoom, cards show only their titles, so 500 nodes stay
 * smooth. */
export const FAR_ZOOM = 0.45;
/** Whether React Flow's zoom is below FAR_ZOOM: a boolean, so a node
 * redraws only when the zoom crosses it. */
export const isFar = (s: { transform: [number, number, number] }) => s.transform[2] < FAR_ZOOM;

/** Further out than this the board is an overview: cards are blocks
 * without text (their titles would be a few pixels tall) and section
 * labels grow to stay readable. */
export const OVERVIEW_ZOOM = 0.2;
export const isOverview = (s: { transform: [number, number, number] }) => s.transform[2] < OVERVIEW_ZOOM;

/** Further out than this, expanded cards let go of their note's editor.
 * Between the two, the editor stays, hidden: zooming back and forth
 * around FAR_ZOOM only repaints. */
export const DROP_ZOOM = 0.25;
export const isVeryFar = (s: { transform: [number, number, number] }) => s.transform[2] < DROP_ZOOM;
