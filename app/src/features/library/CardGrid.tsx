import { useCallback, useLayoutEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";

import type { Hit, NoteStats } from "../../lib/vault/types";
import { dragNotes } from "../workspace/drag";
import { matchesWords, type Row } from "./filters";
import { LibraryCard } from "./LibraryCard";
import { columnsOf, moveFocus } from "./selection";

export type OpenEvent = MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>;

export interface CardGridProps {
  rows: readonly Row[];
  selected: ReadonlySet<string>;
  stats: ReadonlyMap<string, NoteStats> | null;
  hits: ReadonlyMap<string, Hit> | null;
  words: readonly string[];
  tagColors: Record<string, string>;
  /** Notes with agent writing to review. */
  marked: ReadonlySet<string>;
  /** A click on a card, with its keys: open, toggle or extend. */
  onCardClick(path: string, event: MouseEvent<HTMLElement>): void;
  /** A click on a card's checkbox. */
  onCheck(path: string, event: MouseEvent<HTMLElement>): void;
  /** Space on a card; Shift+Space extends. */
  onPick(path: string, range: boolean): void;
  /** Enter on a card. */
  onOpen(path: string, event: OpenEvent): void;
  onSelectAll(): void;
}

/** Cards in responsive columns, Heptabase style. The arrow keys move across
 * the grid, Enter opens, Space selects and Ctrl+A selects everything shown. */
export function CardGrid(props: CardGridProps) {
  const { rows, selected, stats, hits, words, tagColors, marked } = props;
  const grid = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState(0);
  const current = Math.min(focus, rows.length - 1);

  // Cards call back by index; the latest rows and handlers sit in a ref so
  // the callbacks stay the same and only changed cards redraw.
  const latest = useRef({ props, rows });
  useLayoutEffect(() => {
    latest.current = { props, rows };
  });
  const onClick = useCallback((index: number, event: MouseEvent<HTMLElement>) => {
    const row = latest.current.rows[index];
    if (row) latest.current.props.onCardClick(row.path, event);
  }, []);
  const onCheck = useCallback((index: number, event: MouseEvent<HTMLElement>) => {
    const row = latest.current.rows[index];
    if (row) latest.current.props.onCheck(row.path, event);
  }, []);
  // A selected card drags the whole selection; another card drags itself.
  const onDragStart = useCallback((index: number, event: DragEvent<HTMLElement>) => {
    const row = latest.current.rows[index];
    if (!row) return;
    const { selected } = latest.current.props;
    dragNotes(event, selected.has(row.path) ? [...selected] : [row.path]);
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const card = (event.target as HTMLElement).closest<HTMLElement>("[data-index]");
    if (!card || event.altKey) return;
    const index = Number(card.dataset.index);
    const row = rows[index];
    if (!row) return;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === "a") props.onSelectAll();
    else if (event.key === "Enter") props.onOpen(row.path, event);
    else if (event.key === " " && !mod) props.onPick(row.path, event.shiftKey);
    else {
      if (mod) return;
      const cards = [...(grid.current?.children ?? [])] as HTMLElement[];
      const next = moveFocus(index, event.key, columnsOf(cards.map((c) => c.getBoundingClientRect())), rows.length);
      if (next < 0) return;
      setFocus(next);
      cards[next]?.focus();
      cards[next]?.scrollIntoView?.({ block: "nearest" });
    }
    event.preventDefault();
  }

  return (
    <div
      ref={grid}
      role="listbox"
      aria-label="Cards"
      aria-multiselectable="true"
      onKeyDown={onKeyDown}
      className="grid grid-cols-[repeat(auto-fill,minmax(224px,1fr))] gap-4"
    >
      {rows.map((row, index) => {
        const hit = hits?.get(row.path);
        // Cards found only in their full text show where the words are.
        const snippet = hit?.snippet && !matchesWords(row, words) ? hit.snippet : null;
        return (
          <LibraryCard
            key={row.path}
            row={row}
            index={index}
            selected={selected.has(row.path)}
            selecting={selected.size > 0}
            current={index === current}
            stats={stats?.get(row.path)}
            snippet={snippet}
            words={words}
            tagColors={tagColors}
            marked={marked.has(row.path)}
            onClick={onClick}
            onCheck={onCheck}
            onFocus={setFocus}
            onDragStart={onDragStart}
          />
        );
      })}
    </div>
  );
}
