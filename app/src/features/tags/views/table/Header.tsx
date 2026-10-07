// The table's header: one cell per column with its type, name and sort,
// a menu on click, an edge to drag for its width, and "+" at the end.

import { memo, useRef, useState } from "react";

import type { TagSchema, TagView } from "../../../../lib/vault/types";
import { clampWidth, sortOf, type Column } from "./columns";
import { AddColumn, ColumnMenu, typeName } from "./ColumnMenu";
import { Glyph, TitleMark } from "./icons";
import type { Resizer } from "./useResize";

interface HeaderProps {
  columns: Column[];
  widths: number[];
  view: TagView;
  schema: TagSchema | null;
  change(next: TagView): void;
  resize: Resizer;
}

export const Header = memo(function Header({ columns, widths, view, schema, change, resize }: HeaderProps) {
  return (
    <div role="row" aria-rowindex={1} className="kasten-table-head">
      {columns.map((column, index) => (
        <HeaderCell
          key={column.key}
          column={column}
          index={index}
          count={columns.length}
          width={widths[index] ?? 0}
          view={view}
          schema={schema}
          change={change}
          resize={resize}
        />
      ))}
      <div role="presentation" className="kasten-table-fill">
        <AddColumn view={view} schema={schema} change={change} />
      </div>
    </div>
  );
});

interface HeaderCellProps extends Omit<HeaderProps, "columns" | "widths"> {
  column: Column;
  index: number;
  count: number;
  width: number;
}

function HeaderCell({ column, index, count, width, view, schema, change, resize }: HeaderCellProps) {
  const [open, setOpen] = useState(false);
  const cell = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const dir = sortOf(view, column.key);
  return (
    <div
      ref={cell}
      role="columnheader"
      aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}
      className={`kasten-table-th${column.kind === "title" ? " is-title" : ""}${open ? " is-open" : ""}`}
    >
      <button
        ref={button}
        type="button"
        className="kasten-table-th-button"
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${column.label} · ${typeName(column)}`}
        onClick={() => setOpen((o) => !o)}
      >
        {column.kind === "title" ? <TitleMark /> : <Glyph name={column.type} />}
        <span className="kasten-table-th-label">{column.label}</span>
        {dir && <Glyph name={dir === "asc" ? "up" : "down"} className="is-sort" />}
      </button>
      <span
        role="separator"
        aria-orientation="vertical"
        aria-label={`Width of ${column.label}`}
        aria-valuenow={width}
        aria-valuemin={clampWidth(column, 0)}
        aria-valuemax={clampWidth(column, Infinity)}
        tabIndex={0}
        className="kasten-table-resize"
        onPointerDown={(e) => resize.start(e, index)}
        onKeyDown={(e) => resize.key(e, index)}
      />
      {open && (
        <ColumnMenu
          anchor={cell}
          column={column}
          index={index}
          count={count}
          view={view}
          schema={schema}
          change={change}
          onClose={(refocus) => {
            setOpen(false);
            if (refocus) button.current?.focus({ preventScroll: true });
          }}
        />
      )}
    </div>
  );
}
