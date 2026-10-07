import { type ReactNode, useRef } from "react";

import { IconButton, TextButton } from "../../../ui/Button.tsx";
import "./composites.css";

interface ListEditorProps<T> {
  /** Names the list for assistive technology and the tests: "Steps in focus". */
  label: string;
  items: readonly T[];
  /** Names one row: "Step 2". */
  rowName(index: number): string;
  /** The controls of one row. */
  row(item: T, index: number): ReactNode;
  onAdd(): void;
  /** What the button that adds a row says. */
  addLabel: string;
  onRemove(index: number): void;
  /** Moves the row at `from` to `to`; leave out for a list whose order does not matter. */
  onMove?(from: number, to: number): void;
  /** The row's controls share one line with its name and buttons, for rows of a single small box. */
  compact?: boolean;
  /** Said when there are no rows. */
  empty?: string;
}

/** A row of the list. */
const inRow = (list: HTMLElement | null, index: number) => list?.querySelector<HTMLElement>(`[data-row="${index}"]`) ?? null;

/** The button that moves a row `way`, or the other one when that one is off (a row at an end): a keyboard user can go on pressing. */
function moveButton(row: HTMLElement | null, way: "up" | "down"): HTMLElement | null {
  const wanted = row?.querySelector<HTMLButtonElement>(`[data-move="${way}"]`);
  return wanted && !wanted.disabled ? wanted : (row?.querySelector<HTMLElement>(`[data-move="${way === "up" ? "down" : "up"}"]:not(:disabled)`) ?? null);
}

/**
 * A list of rows that can grow, shrink and be put in another order, each row
 * with buttons to move it up and down and to take it away. The focus goes
 * with a row that moves, to the new row when one is added, and to the row that
 * takes the place of one that goes.
 */
export function ListEditor<T>({ label, items, rowName, row, onAdd, addLabel, onRemove, onMove, compact, empty }: ListEditorProps<T>) {
  const list = useRef<HTMLUListElement>(null);
  // The DOM is drawn again after the deck changes; the focus moves once it has been.
  const later = (move: () => void) => requestAnimationFrame(move);
  const move = (from: number, to: number) => {
    onMove?.(from, to);
    later(() => moveButton(inRow(list.current, to), to < from ? "up" : "down")?.focus());
  };
  const remove = (index: number) => {
    onRemove(index);
    later(() => (inRow(list.current, Math.min(index, items.length - 2))?.querySelector<HTMLElement>("[data-remove]") ?? list.current?.parentElement?.querySelector<HTMLElement>("[data-add]"))?.focus());
  };
  const tools = (index: number) => (
    <span className="ks-cs-tools">
      {onMove ? (
        <>
          <IconButton icon="arrow-up" label={`Move ${rowName(index).toLowerCase()} up`} data-move="up" disabled={index === 0} onClick={() => move(index, index - 1)} />
          <IconButton icon="arrow-down" label={`Move ${rowName(index).toLowerCase()} down`} data-move="down" disabled={index === items.length - 1} onClick={() => move(index, index + 1)} />
        </>
      ) : null}
      <IconButton icon="trash" label={`Remove ${rowName(index).toLowerCase()}`} data-remove="" onClick={() => remove(index)} />
    </span>
  );
  return (
    <div className="ks-cs-list">
      <ul ref={list} className="ks-cs-rows" aria-label={label}>
        {items.map((item, index) => (
          <li key={index} className={`ks-cs-item${compact ? " is-compact" : ""}`} data-row={index} aria-label={rowName(index)}>
            {compact ? (
              <>
                <span className="ks-cs-name">{index + 1}</span>
                <div className="ks-cs-body">{row(item, index)}</div>
                {tools(index)}
              </>
            ) : (
              <>
                <div className="ks-cs-head">
                  <span className="ks-cs-name">{rowName(index)}</span>
                  {tools(index)}
                </div>
                <div className="ks-cs-body">{row(item, index)}</div>
              </>
            )}
          </li>
        ))}
      </ul>
      {items.length === 0 && empty ? <p className="ks-sp-hint">{empty}</p> : null}
      <div>
        <TextButton
          data-add=""
          onClick={() => {
            onAdd();
            later(() => inRow(list.current, items.length)?.querySelector<HTMLElement>("input, textarea, select")?.focus());
          }}
        >
          {addLabel}
        </TextButton>
      </div>
    </div>
  );
}

/** What a list says when the selected elements have different ones: it cannot be shown as one. */
export function MixedList({ what }: { what: string }) {
  return (
    <p className="ks-sp-hint" role="status">
      Mixed: the selected items have different {what}. Select one to edit them.
    </p>
  );
}
