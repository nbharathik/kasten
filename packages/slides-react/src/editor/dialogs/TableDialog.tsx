import { type JSX, type KeyboardEvent, useRef, useState } from "react";

import { table } from "../factory.ts";
import { TextButton } from "../ui/Button.tsx";
import { Dialog } from "../ui/Dialog.tsx";
import type { DialogProps } from "./types.ts";
import "./dialogs.css";

const SIZE = 8;
/** How big a table starts out: this wide for each column and this tall for each row, within the slide. */
const COLUMN_WIDTH = 160;
const ROW_HEIGHT = 44;
const MARGIN = 64;

const cells = Array.from({ length: SIZE * SIZE }, (_, i) => ({ row: Math.floor(i / SIZE) + 1, column: (i % SIZE) + 1 }));

/** A grid to sweep out the size of a table with the pointer or the arrow keys; picking a cell puts the table in the middle of the slide. */
export function TableDialog({ session, onClose }: DialogProps): JSX.Element {
  const [size, setSize] = useState({ row: 1, column: 1 });
  const grid = useRef<HTMLDivElement>(null);

  const insert = (rows: number, columns: number) => {
    const slide = session.deck.size;
    const w = Math.min(slide.w - 2 * MARGIN, columns * COLUMN_WIDTH);
    const h = Math.min(slide.h - 2 * MARGIN, rows * ROW_HEIGHT);
    session.elements.insert([table(rows, columns, { x: Math.round((slide.w - w) / 2), y: Math.round((slide.h - h) / 2), w, h })]);
    onClose();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const move = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] }[event.key];
    if (!move) return;
    event.preventDefault();
    const row = Math.min(SIZE, Math.max(1, size.row + (move[0] ?? 0)));
    const column = Math.min(SIZE, Math.max(1, size.column + (move[1] ?? 0)));
    setSize({ row, column });
    grid.current?.querySelector<HTMLElement>(`[data-cell="${row}-${column}"]`)?.focus();
  };

  return (
    <Dialog title="Insert table" width={300} onClose={onClose} footer={<TextButton onClick={onClose}>Cancel</TextButton>}>
      <div ref={grid} className="ks-dg-grid" role="group" aria-label="Table size" onKeyDown={onKeyDown}>
        {cells.map(({ row, column }) => (
          <button
            key={`${row}-${column}`}
            type="button"
            data-cell={`${row}-${column}`}
            {...(row === 1 && column === 1 ? { "data-autofocus": "" } : {})}
            className={`ks-dg-cell${row <= size.row && column <= size.column ? " is-in" : ""}`}
            tabIndex={row === size.row && column === size.column ? 0 : -1}
            aria-label={`${column} ${column === 1 ? "column" : "columns"} by ${row} ${row === 1 ? "row" : "rows"}`}
            onMouseEnter={() => setSize({ row, column })}
            onFocus={() => setSize({ row, column })}
            onClick={() => insert(row, column)}
          />
        ))}
      </div>
      <p className="ks-dg-size" role="status">
        {size.column} × {size.row}
      </p>
    </Dialog>
  );
}
