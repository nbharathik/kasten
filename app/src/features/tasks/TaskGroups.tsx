// The Tasks list: to-dos in their groups, ticked in place.

import type { KeyboardEvent } from "react";

import { isDay, shortDay } from "../../lib/dates";
import type { TaskRow } from "../../lib/vault/types";
import { tickTask } from "../dashboard/todo-actions";
import { howFrom, howFromView, useWorkspace } from "../workspace/store";
import type { Grouping, TaskGroup } from "./filters";
import { IconOrEmoji } from "../../ui/IconOrEmoji";
import { lineIcon } from "../../ui/glyph";
import { useReveal } from "../../ui/useReveal";

interface Props {
  rows: TaskRow[] | null;
  groups: TaskGroup[];
  by: Grouping;
  today: string;
  /** Whether a filter narrows the list, for what an empty one says. */
  filtered: boolean;
}

export function TaskGroups({ rows, groups, by, today, filtered }: Props) {
  const { openPath } = useWorkspace.getState();
  // Thousands of to-dos draw in steps, as the reader scrolls to them.
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  const { shown, more } = useReveal(total);
  if (rows && groups.length === 0) {
    return (
      <p className="py-12 text-center text-14 text-muted">
        {filtered ? "No to-dos match these filters." : `Nothing to do. Type [] and a space on any page to add a to-do, and [[${today}]] or @${today} to give it a day.`}
      </p>
    );
  }
  let left = shown;
  const drawn = groups.flatMap((g) => {
    if (left <= 0) return [];
    const some = g.rows.slice(0, left);
    left -= some.length;
    return [{ ...g, rows: some }];
  });
  return (
    <div onKeyDown={moveBetweenTodos}>
      {drawn.map((g) => (
        <section key={g.key} className="mt-7" aria-label={g.label}>
          {g.path ? (
            <button type="button" onClick={(e) => openPath(g.path!, howFrom(e))} className="inline-flex items-center gap-1.5 rounded px-1 text-14 font-semibold hover:bg-line/50">
              {g.icon && <IconOrEmoji icon={g.icon} />}
              {g.label}
            </button>
          ) : (
            <h2 className={`flex items-center gap-1.5 px-1 text-14 font-semibold ${g.tone === "late" ? "text-danger" : g.tone === "today" ? "text-accent" : ""}`}>
              {g.icon && <IconOrEmoji icon={g.icon} />}
              {g.label}
            </h2>
          )}
          <ul className="mt-1.5">
            {g.rows.map((row) => (
              <Row key={`${row.path}:${row.line}`} row={row} by={by} today={today} />
            ))}
          </ul>
        </section>
      ))}
      {shown < total && <div ref={more} aria-hidden className="h-px" />}
    </div>
  );
}

/** ↑ and ↓ move between the to-dos' boxes, Home and End to the first and
 * last; Space ticks the one with focus, as a checkbox does. */
function moveBetweenTodos(event: KeyboardEvent<HTMLDivElement>): void {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  const target = event.target as HTMLElement;
  if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") return;
  const boxes = [...event.currentTarget.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  const at = boxes.indexOf(target);
  const next = event.key === "Home" ? 0 : event.key === "End" ? boxes.length - 1 : at + (event.key === "ArrowDown" ? 1 : -1);
  const box = boxes[Math.max(0, Math.min(boxes.length - 1, next))];
  if (!box) return;
  event.preventDefault();
  box.focus();
  box.scrollIntoView?.({ block: "nearest" });
}

function Row({ row, by, today }: { row: TaskRow; by: Grouping; today: string }) {
  const late = !row.done && row.due !== null && row.due < today;
  return (
    <li className="group flex items-start gap-2.5 rounded-md px-1 py-1 hover:bg-line/30">
      <input type="checkbox" className="mt-[3px] size-4 shrink-0 accent-[var(--color-accent)]" checked={row.done} aria-label={row.text} onChange={() => void tickTask(row)} />
      <span className={`min-w-0 flex-1 text-14 ${row.done ? "text-muted line-through" : ""}`}>{row.text}</span>
      {row.due && (
        <span className={`shrink-0 rounded px-1.5 text-12 leading-5 ${late ? "bg-danger/10 text-danger" : row.due === today ? "bg-accent/10 text-accent" : "bg-line/60 text-muted"}`}>{row.due === today ? "Today" : row.due}</span>
      )}
      {by !== "page" && (
        <button type="button" onClick={(e) => useWorkspace.getState().openPath(row.path, howFromView(e))} className="max-w-[40%] shrink-0 truncate text-13 text-muted hover:text-ink hover:underline">
          <IconOrEmoji icon={isDay(row.title) ? lineIcon("journal") : row.icon || lineIcon("page")} /> {isDay(row.title) ? shortDay(row.title) : row.title}
        </button>
      )}
    </li>
  );
}
