// "Brainstorm on this board": the chat backend asks the
// model and places the ideas in a session of their own; then the board
// reloads, the view moves to the new section, and a toast offers to review
// the session in History, where one click undoes it. A brainstorm goes on
// when its form closes: the bar shows it is under way, and a failure the
// form cannot show becomes a toast.

import { create } from "zustand";

import { useChat } from "../../chat/store";
import type { Brainstormed, BrainstormRequest } from "../../chat/types";
import { showSession } from "../../review/session-request";
import { useWorkspace } from "../../workspace/store";
import type { BoardController } from "../canvas/state/controller";
import { boardFilesChanged } from "../events";

interface BrainstormState {
  /** Boards with a brainstorm under way, by path. */
  running: Record<string, true>;
  /** Why the last brainstorm on a board failed, by path. */
  errors: Record<string, string>;
  /** Open forms, by board path: they show failures themselves. */
  forms: Record<string, number>;
}

export const useBrainstorms = create<BrainstormState>()(() => ({ running: {}, errors: {}, forms: {} }));

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _, ...rest } = record;
  return rest;
}

/** A form for `board` is showing; returns how to say it closed. */
export function formOpened(board: string): () => void {
  useBrainstorms.setState((s) => ({ forms: { ...s.forms, [board]: (s.forms[board] ?? 0) + 1 } }));
  return () => useBrainstorms.setState((s) => ({ forms: (s.forms[board] ?? 0) > 1 ? { ...s.forms, [board]: s.forms[board]! - 1 } : without(s.forms, board) }));
}

export const dismissError = (board: string) => useBrainstorms.setState((s) => ({ errors: without(s.errors, board) }));

const ideas = (n: number) => `${n} idea${n === 1 ? "" : "s"}`;

/** Runs a brainstorm on `board`'s board; `reveal` moves the view to the new
 * section once the board shows it. Null when it failed, or when one is
 * already under way there. */
export async function brainstorm(board: BoardController, request: Omit<BrainstormRequest, "board">, reveal?: (section: string) => void): Promise<Brainstormed | null> {
  const path = board.path;
  if (useBrainstorms.getState().running[path]) return null;
  useBrainstorms.setState((s) => ({ running: { ...s.running, [path]: true }, errors: without(s.errors, path) }));
  const { toast, filesChanged } = useWorkspace.getState();
  try {
    const done = await useChat.getState().ensure().brainstorm({ ...request, board: path });
    void filesChanged(done.cards);
    await board.refresh();
    boardFilesChanged([path]);
    reveal?.(done.section);
    toast(`Placed ${ideas(done.cards.length)} on the board. Undo them all from History.`, { label: "Review", run: () => showSession(done.session) });
    return done;
  } catch (err) {
    const why = message(err);
    useBrainstorms.setState((s) => ({ errors: { ...s.errors, [path]: why } }));
    if (!useBrainstorms.getState().forms[path]) toast(`The brainstorm did not finish: ${why}`);
    return null;
  } finally {
    useBrainstorms.setState((s) => ({ running: without(s.running, path) }));
  }
}
