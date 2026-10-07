// Moving cards between columns: the card shows in its new column at once,
// the new value goes through the core's `update_props` op (one commit), a
// refusal puts the card back (the core's reason is toasted), and the toast's
// Undo writes the old value back as one more commit. Keyboard moves wait for
// the keys to pause, so a run of Alt+→ is one commit and one Undo.

import { useCallback, useEffect, useRef, useState } from "react";

import { useWorkspace } from "../../../workspace/store";
import { propOf } from "../../../panel/properties/values";
import { setValue } from "../../actions";
import { columnKey, type Pending, type PendingMove } from "./model";

/** How long keyboard moves wait for the next key before writing. */
export const KEY_PAUSE = 600;

/** The card a move takes, and where it was before. */
export interface MoveTarget {
  path: string;
  /** The property the board groups by. */
  key: string;
  title: string;
  /** Its value before the move (null for none), for Undo. */
  from: string | null;
  /** The column it came from, as headed. */
  fromLabel: string;
}

/** The column a move goes to: its value (null clears it) and heading. */
export interface MoveTo {
  value: string | null;
  label: string;
}

export interface Moves {
  /** Where cards are going, until the vault has them there. */
  pending: Pending;
  /** Moves a card: written now, or once the keys pause (`later`). */
  move(target: MoveTarget, to: MoveTo, later?: boolean): void;
}

interface Waiting {
  target: MoveTarget;
  to: MoveTo;
  timer?: ReturnType<typeof setTimeout>;
}

/** What a write came to: made, not needed (the note had the value), or refused. */
type Written = "written" | "same" | "refused";

const NONE: Pending = new Map();
const sameMove = (a: PendingMove | undefined, b: PendingMove) => a !== undefined && a.key === b.key && a.value === b.value;
const holds = (value: unknown, wanted: string | null) => (wanted === null ? value === null || value === undefined || value === "" : value === wanted);

/** Resolves once the next frame is painted, so a moved card shows in its new
 * column before the write starts, however quick or slow the vault. A hidden
 * window paints no frames; the timer lets the write go anyway. */
const afterPaint = () =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 100);
    if (typeof requestAnimationFrame === "function")
      requestAnimationFrame(() =>
        setTimeout(() => {
          clearTimeout(timer);
          resolve();
        }, 0),
      );
  });

export function useMoves(): Moves {
  const [pending, setPending] = useState<Pending>(NONE);
  const waiting = useRef(new Map<string, Waiting>());
  // Writes to one note run one after another, in the order asked.
  const queues = useRef(new Map<string, { last: Promise<unknown>; count: number }>());

  /** Shows a card going somewhere, or with null where the vault has it;
   * `only` clears it only while it still shows that move. */
  const show = useCallback((path: string, move: PendingMove | null, only?: PendingMove) => {
    setPending((current) => {
      if (only && !sameMove(current.get(path), only)) return current;
      if (move ? sameMove(current.get(path), move) : !current.has(path)) return current;
      const next = new Map(current);
      if (move) next.set(path, move);
      else next.delete(path);
      return next.size === 0 ? NONE : next;
    });
  }, []);

  /** Writes one value after any write to the note still on its way. */
  const write = useCallback(
    (path: string, move: PendingMove): Promise<Written> => {
      const queue = queues.current.get(path) ?? { last: Promise.resolve(), count: 0 };
      const run = async (): Promise<Written> => {
        try {
          const now = useWorkspace.getState().notes.find((note) => note.path === path);
          if (now && holds(propOf(now.props, move.key), move.value)) return "same";
          return (await setValue(path, move.key, move.value)) ? "written" : "refused";
        } finally {
          // Unless another move took over meanwhile, the notes say where it is now.
          show(path, null, move);
          if (--queue.count === 0) queues.current.delete(path);
        }
      };
      queue.count++;
      const done = queue.last.then(afterPaint).then(run);
      queue.last = done.catch(() => "refused");
      queues.current.set(path, queue);
      return done;
    },
    [show],
  );

  const commit = useCallback(
    async ({ target, to }: Waiting) => {
      const { path, key, title, from, fromLabel } = target;
      if ((await write(path, { key, value: to.value })) !== "written") return;
      useWorkspace.getState().toast(`Moved “${title}” to ${to.label}`, {
        label: "Undo",
        run: () => {
          const back = { key, value: from };
          show(path, back);
          void write(path, back).then((done) => done === "written" && useWorkspace.getState().toast(`Moved “${title}” back to ${fromLabel}`));
        },
      });
    },
    [show, write],
  );

  const move = useCallback(
    (target: MoveTarget, to: MoveTo, later = false) => {
      const { path } = target;
      const known = waiting.current.get(path);
      clearTimeout(known?.timer);
      waiting.current.delete(path);
      // A run of key moves keeps where it started, so one Undo takes it back.
      const entry: Waiting = { target: known?.target ?? target, to };
      if (columnKey(entry.target.from) === columnKey(to.value) && !queues.current.has(path)) {
        // Back where it started, with nothing on its way: nothing to write.
        show(path, null);
        return;
      }
      show(path, { key: entry.target.key, value: to.value });
      if (!later) return void commit(entry);
      entry.timer = setTimeout(() => {
        waiting.current.delete(path);
        void commit(entry);
      }, KEY_PAUSE);
      waiting.current.set(path, entry);
    },
    [commit, show],
  );

  // Leaving the view, or the window going away, writes key moves still
  // waiting for a pause.
  useEffect(() => {
    const queued = waiting.current;
    const flush = () => {
      for (const entry of queued.values()) {
        clearTimeout(entry.timer);
        void commit(entry);
      }
      queued.clear();
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [commit]);

  return { pending, move };
}
