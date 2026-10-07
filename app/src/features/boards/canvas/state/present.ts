// Presenting a board: its sections one at a time, filling the
// screen, in the order slides.ts gives. Nothing is selected or edited
// while it runs; the canvas moves the view (usePresentation).

import { slides, startAt } from "../model/slides";
import type { BoardController } from "./controller";
import { select, selectedNodes } from "./store";

/** Starts the presentation at the section selected, or the one holding
 * what is selected, else at the first. Without sections, says how. */
export function present(board: BoardController): void {
  const deck = slides(board.doc.nodes);
  if (deck.length === 0) {
    board.deps.toast("Sections are the slides: select what belongs together and press G.");
    return;
  }
  const state = board.store.getState();
  const chosen = selectedNodes(state).map((n) => n.data.node);
  select(board.store, []);
  board.store.setState({ presenting: startAt(deck, chosen), tool: "select", menu: null, editing: null, hovered: null });
}

/** Moves `by` slides, staying within the deck. */
export function step(board: BoardController, by: number): void {
  const { presenting } = board.store.getState();
  if (presenting === null) return;
  goTo(board, presenting + by);
}

export function goTo(board: BoardController, index: number): void {
  const count = slides(board.doc.nodes).length;
  if (board.store.getState().presenting === null) return;
  if (count === 0) return stopPresenting(board);
  board.store.setState({ presenting: Math.min(Math.max(index, 0), count - 1) });
}

export function stopPresenting(board: BoardController): void {
  if (board.store.getState().presenting !== null) board.store.setState({ presenting: null });
}
