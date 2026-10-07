// The kanban board: the tag's
// notes in a column per option of a select property, each column in the
// view's order. Dragging a card to another column, or Alt+← / Alt+→ on a
// focused one, sets that property through the core (one commit, with Undo
// in the toast); "+ New" at a column's foot adds a card to it.

import { useCallback, useId, useLayoutEffect, useMemo, useRef, type KeyboardEvent } from "react";

import { dayFrom } from "../../../../lib/dates";
import type { PropDef } from "../../../../lib/vault/types";
import { titleOf } from "../../../workspace/names";
import { howFromView, useWorkspace, type OpenHow } from "../../../workspace/store";
import { addNote } from "../../actions";
import { useNoteHome } from "../../home";
import { applyView, columnsOf, type Column } from "../../model";
import type { ViewProps } from "../types";
import { cardDefs, colorDef, columnKey, fromValue, labelOf, stepColumn, steadyColumns, takesCards, withPending } from "./model";
import { BoardBar } from "./BoardBar";
import { BoardColumn } from "./Column";
import { BoardContext, type BoardActions, type OpenEvent } from "./context";
import { cardKey, focusNear } from "./keys";
import { useCardDrag } from "./use-drag";
import { useMoves } from "./use-moves";

/** A card on its way to a column, to focus or show once it is there. */
interface Arrival {
  path: string;
  column: string;
  focus: boolean;
  at: number;
}

/** How long an arrival waits for its card (a view's filter may hide it). */
const ARRIVAL_WAIT = 4000;
const flashes = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/** Lights a card up for a moment where it landed. */
function flash(card: HTMLElement): void {
  clearTimeout(flashes.get(card));
  card.removeAttribute("data-landed");
  void card.offsetWidth; // Starts the animation again.
  card.setAttribute("data-landed", "");
  flashes.set(
    card,
    setTimeout(() => card.removeAttribute("data-landed"), 1000),
  );
}

const open = (path: string, how: OpenEvent | OpenHow) => useWorkspace.getState().openPath(path, typeof how === "string" ? how : howFromView(how));

export function Board({ tag, schema, view, notes, onChange, def, project = null, bare = false }: ViewProps & { def: PropDef }) {
  const { pending, move } = useMoves();
  const shown = useMemo(() => (pending.size ? applyView(withPending(notes, pending), view, schema) : notes), [notes, pending, view, schema]);
  const steady = useRef<Column[]>([]);
  const columns = useMemo(() => (steady.current = steadyColumns(steady.current, columnsOf(shown, def))), [shown, def]);
  // By the properties, not the schema: saving a view makes a new schema object.
  const properties = schema?.properties;
  const defs = useMemo(() => cardDefs(properties, def.key), [properties, def.key]);
  const colorBy = colorDef(view, schema);
  const today = dayFrom(0);
  const hint = useId();
  const root = useRef<HTMLDivElement>(null);
  const arriving = useRef<Arrival | null>(null);
  const home = useNoteHome();
  const latest = useRef({ tag, def, columns, move, project, home });
  useLayoutEffect(() => {
    latest.current = { tag, def, columns, move, project, home };
  });

  /** Focuses or shows a card that just moved or was made, once it is in its column. */
  const land = useCallback(() => {
    const next = arriving.current;
    if (!next || !root.current) return;
    if (Date.now() - next.at > ARRIVAL_WAIT) {
      arriving.current = null;
      return;
    }
    const card = root.current.querySelector<HTMLElement>(`[data-card="${CSS.escape(next.path)}"]`);
    if (!card || card.closest<HTMLElement>("[data-column]")?.dataset.column !== next.column) return;
    arriving.current = null;
    if (next.focus) card.focus({ preventScroll: true });
    card.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    flash(card);
  }, []);
  useLayoutEffect(land);

  /** Moves a card into the column with handle `to`; nothing when it is there already. */
  const moveTo = useCallback((path: string, to: string, byKey: boolean) => {
    const { def: group, columns: now, move: send } = latest.current;
    const target = now.find((c) => columnKey(c.value) === to);
    const home = now.find((c) => c.notes.some((n) => n.path === path));
    const note = home?.notes.find((n) => n.path === path);
    if (!target || !home || !note || target === home || !takesCards(target.value, group)) return;
    const from = fromValue(note, group.key);
    arriving.current = { path, column: to, focus: true, at: Date.now() };
    send({ path, key: group.key, title: titleOf(note), from, fromLabel: labelOf(from, group) }, { value: target.value, label: target.label }, byKey);
  }, []);

  const { press } = useCardDrag(root, (path, to) => moveTo(path, to, false));

  const onKey = useCallback(
    (event: KeyboardEvent<HTMLElement>, path: string) => {
      if (event.target !== event.currentTarget || event.nativeEvent.isComposing) return;
      const asked = cardKey(event);
      if (!asked) return;
      event.preventDefault();
      const card = event.currentTarget;
      if (asked.kind === "open") return open(path, event);
      if (asked.kind === "focus") return focusNear(card, asked.dir);
      // Alt+← / Alt+→ belong to the card: the window's Back and Forward never see them.
      event.stopPropagation();
      const { columns: now, def: group } = latest.current;
      const at = now.findIndex((c) => columnKey(c.value) === card.closest<HTMLElement>("[data-column]")?.dataset.column);
      const to = stepColumn(now, at, asked.step, group);
      if (to !== null) moveTo(path, columnKey(now[to]!.value), true);
    },
    [moveTo],
  );

  const add = useCallback(
    async (value: string | null, title: string) => {
      const { tag: name, def: group, project: folder, home } = latest.current;
      const note = await addNote(name, title, value === null ? {} : { [group.key]: value }, { project: folder ?? home.project, parent: home.parent });
      if (!note) return false;
      arriving.current = { path: note.meta.path, column: columnKey(value), focus: false, at: Date.now() };
      land();
      return true;
    },
    [land],
  );

  const actions = useMemo<BoardActions>(() => ({ hint, open, press, key: onKey, add }), [hint, press, onKey, add]);

  return (
    <BoardContext.Provider value={actions}>
      <div ref={root} className="kasten-kanban">
        {!bare && <BoardBar view={view} schema={schema} onChange={onChange} />}
        {columns.length > 0 ? (
          <div className="kasten-kanban-board" data-board>
            {columns.map((column) => (
              <BoardColumn key={columnKey(column.value)} column={column} def={def} defs={defs} colorBy={colorBy} today={today} />
            ))}
          </div>
        ) : (
          <p className="kasten-tag-empty">
            “{def.key}” has no options yet. Add some with Properties at the top of the page, and each becomes a column.
          </p>
        )}
        <p id={hint} className="sr-only">
          Enter opens the card. Alt+← and Alt+→ move it to the column before or after. The arrow keys go from card to card.
        </p>
      </div>
    </BoardContext.Provider>
  );
}
