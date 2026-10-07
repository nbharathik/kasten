import { useEffect, useRef, type MouseEvent } from "react";

import { relativeTime } from "../../lib/dates";
import type { NoteStats } from "../../lib/vault/types";
import { dragNotes } from "../workspace/drag";
import { kindLabel, type Row, type Sort, type SortKey } from "./filters";
import { AgentStar, Glyph, Marked, TagChips, fullDate } from "./parts";
import { KindTile } from "./kind-tile";

export interface CardTableProps {
  rows: readonly Row[];
  selected: ReadonlySet<string>;
  stats: ReadonlyMap<string, NoteStats> | null;
  tagColors: Record<string, string>;
  /** Notes with agent writing to review. */
  marked: ReadonlySet<string>;
  /** Search words to mark in titles. */
  words: readonly string[];
  sort: Sort;
  onSort(key: SortKey): void;
  /** A click on a row or its title, with its keys: open, toggle or extend. */
  onRowClick(path: string, event: MouseEvent<HTMLElement>): void;
  onCheck(path: string, event: MouseEvent<HTMLElement>): void;
  /** The header checkbox: everything shown, or nothing. */
  onCheckAll(): void;
}

// A narrow table keeps room for titles: the least needed columns go first.
const WIDE = "hidden @5xl:table-cell";
const MEDIUM = "hidden @4xl:table-cell";

const COLUMNS: { key: SortKey; label: string; width: string; right?: boolean }[] = [
  { key: "title", label: "Title", width: "" },
  { key: "type", label: "Type", width: `w-[80px] ${WIDE}` },
  { key: "place", label: "Project", width: "w-[124px]" },
  { key: "tags", label: "Tags", width: "w-[160px]" },
  { key: "created", label: "Created", width: `w-[104px] ${WIDE}` },
  { key: "updated", label: "Updated", width: "w-[104px]" },
  { key: "boards", label: "Boards", width: `w-[68px] ${MEDIUM}`, right: true },
  { key: "backlinks", label: "Backlinks", width: "w-[84px]", right: true },
];

/** Every note as a row: click a header to sort,
 * tick rows to act on them together. */
export function CardTable({ rows, selected, stats, tagColors, marked, words, sort, onSort, onRowClick, onCheck, onCheckAll }: CardTableProps) {
  const all = rows.length > 0 && rows.every((r) => selected.has(r.path));
  const some = !all && rows.some((r) => selected.has(r.path));
  const header = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (header.current) header.current.indeterminate = some;
  }, [some]);

  return (
    <div className="@container overflow-x-auto rounded-xl border border-line bg-raised shadow-card">
      <table className="w-full min-w-[640px] table-fixed border-collapse text-13" aria-label="Cards">
        <thead>
          <tr className="border-b border-line bg-panel/70 text-left text-12 text-muted">
            <th className="w-11 py-2 pl-4 pr-2 font-medium">
              <input
                ref={header}
                type="checkbox"
                aria-label="Select all shown"
                checked={all}
                onChange={onCheckAll}
                className="size-3.5 cursor-pointer accent-accent"
              />
            </th>
            {COLUMNS.map((column) => {
              const active = sort.key === column.key;
              return (
                <th
                  key={column.key}
                  aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                  className={`${column.width} py-1.5 pr-3 font-medium ${column.right ? "text-right" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => onSort(column.key)}
                    className={`inline-flex items-center gap-1 rounded px-1 py-0.5 outline-none transition-colors hover:bg-line/50 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/60 ${active ? "text-ink" : ""} ${column.right ? "-mr-1" : "-ml-1"}`}
                  >
                    {column.label}
                    {active && <Glyph name={sort.dir === "asc" ? "up" : "down"} className="size-3" />}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const on = selected.has(row.path);
            const s = stats?.get(row.path);
            return (
              <tr
                key={row.path}
                onClick={(event) => onRowClick(row.path, event)}
                onMouseDown={(event) => event.shiftKey && event.preventDefault()}
                draggable
                onDragStart={(event) => dragNotes(event, on ? [...selected] : [row.path])}
                className={`group cursor-pointer border-b border-line/70 transition-colors last:border-b-0 ${on ? "bg-accent/5" : "hover:bg-panel"}`}
              >
                <td className="py-2 pl-4 pr-2">
                  <input
                    type="checkbox"
                    aria-label={`Select ${row.title}`}
                    checked={on}
                    onChange={() => {}}
                    onClick={(event) => {
                      event.stopPropagation();
                      onCheck(row.path, event);
                    }}
                    className="size-3.5 cursor-pointer accent-accent"
                  />
                </td>
                <td className="py-2 pr-3">
                  <button
                    type="button"
                    data-library-item=""
                    onClick={(event) => {
                      event.stopPropagation();
                      onRowClick(row.path, event);
                    }}
                    className="flex max-w-full items-center gap-2 rounded text-left font-medium text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                  >
                    <KindTile kind={row.note.kind} icon={row.icon} small />
                    <span className="truncate group-hover:underline group-hover:decoration-line group-hover:underline-offset-4">
                      <Marked text={row.title} words={words} />
                    </span>
                    {marked.has(row.path) && <AgentStar />}
                  </button>
                </td>
                <td className={`truncate py-2 pr-3 text-muted ${WIDE}`}>{kindLabel(row.note.kind)}</td>
                <td className="truncate py-2 pr-3 text-muted" title={row.placeLabel}>
                  {row.placeLabel}
                </td>
                <td className="py-2 pr-3">
                  <TagChips tags={row.note.tags} colors={tagColors} max={2} small />
                </td>
                <td className={`truncate py-2 pr-3 text-muted ${WIDE}`} title={row.created === null ? undefined : fullDate(row.created)}>
                  {row.created === null ? "—" : relativeTime(row.created)}
                </td>
                <td className="truncate py-2 pr-3 text-muted" title={fullDate(row.updated)}>
                  {relativeTime(row.updated)}
                </td>
                <Count value={s?.boards} className={MEDIUM} />
                <Count value={s?.backlinks} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Count({ value, className = "" }: { value: number | undefined; className?: string }) {
  return <td className={`py-2 pr-4 text-right tabular-nums ${value ? "text-ink" : "text-muted/60"} ${className}`}>{value ?? "–"}</td>;
}
