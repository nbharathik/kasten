// What a column and a card can ask of the board around them. One stable
// object through context, so memoised columns and cards redraw only when
// their own notes do.

import { createContext, useContext, type KeyboardEvent, type PointerEvent } from "react";

import type { OpenHow } from "../../../workspace/store";

/** Where a click or key asks to open something: its modifier keys and button. */
export type OpenEvent = { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean; button?: number };

export interface BoardActions {
  /** Opens a note in place, or as the event's modifiers ask. */
  open(path: string, how: OpenEvent | OpenHow): void;
  /** A press on a card, which may become a drag. */
  press(event: PointerEvent<HTMLElement>, path: string): void;
  /** Keys on a focused card: Enter opens, Alt+←/→ moves, arrows go to another card. */
  key(event: KeyboardEvent<HTMLElement>, path: string): void;
  /** Adds a card to the column for `value`; true once it is in the vault. */
  add(value: string | null, title: string): Promise<boolean>;
  /** The id of the text saying what a card's keys do. */
  hint: string;
}

export const BoardContext = createContext<BoardActions | null>(null);

export function useBoard(): BoardActions {
  const actions = useContext(BoardContext);
  if (!actions) throw new Error("Kanban columns and cards need the board around them");
  return actions;
}
