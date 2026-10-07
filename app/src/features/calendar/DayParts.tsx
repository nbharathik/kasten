// The pieces every day shares, in the month's cells, the week's columns and
// the agenda's rows: its number and its journal (each opens the journal
// page), the "+" menu and the quick-add field it opens, and the "+N more"
// popover.

import { useEffect, useRef, useState, type ReactNode } from "react";

import type { NoteMeta } from "../../lib/vault/types";
import { Icon } from "../../ui/Icon";
import { Menu } from "../../shell/Menu";
import { Popup } from "../pages/page/Popup";
import { useCalendarActions, type AddKind } from "./actions";
import { ADD_KINDS, addLabel } from "./add";
import { EntryChip, entryKey } from "./Chip";
import { fullDay, type Entry } from "./layout";

const MONTH_DAY = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: "short" });

const dateOf = (day: string) => new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));

/** The day's number; the first of a month also names the month ("Oct 1"). */
export const dayNumber = (day: string) => (day.endsWith("-01") ? MONTH_DAY.format(dateOf(day)) : String(Number(day.slice(8))));

export const weekdayOf = (day: string) => WEEKDAY.format(dateOf(day));

/** The day's number: shows its journal page (a blank day offers to start it). */
export function DayNumber({ day, today, label, className }: { day: string; today: boolean; label: string; className: string }) {
  const actions = useCalendarActions();
  return (
    <button
      type="button"
      className={className}
      aria-current={today ? "date" : undefined}
      aria-label={`Journal for ${fullDay(day)}`}
      title="Open this day’s journal"
      onClick={(event) => actions.openDay(day, event)}
      onMouseDown={(event) => event.button === 1 && event.preventDefault()}
      onAuxClick={(event) => event.button === 1 && actions.openDay(day, { button: 1 })}
    >
      {label}
    </button>
  );
}

/** The journal icon, when the day has a journal page: opens it. */
export function JournalLink({ day, journal }: { day: string; journal: NoteMeta }) {
  const actions = useCalendarActions();
  return (
    <button
      type="button"
      className="kasten-cal-journal"
      aria-label={`Journal page for ${fullDay(day)}`}
      title="Open this day’s journal page"
      onClick={(event) => actions.openDay(day, event)}
      onAuxClick={(event) => event.button === 1 && actions.open(journal.path, "tab")}
    >
      <Icon name="journal" className="size-[14px]" />
    </button>
  );
}

/** The day's journal page as a line, with its first words: in the week's
 * columns and the agenda, where there is room to read them. */
export function JournalChip({ day, journal, large = false }: { day: string; journal: NoteMeta; large?: boolean }) {
  const actions = useCalendarActions();
  return (
    <button
      type="button"
      className={`kasten-cal-journal-chip${large ? " is-large" : ""}`}
      aria-label={`Journal page for ${fullDay(day)}`}
      title={journal.excerpt ? `Journal\n${journal.excerpt.slice(0, 200)}` : "Journal"}
      onClick={(event) => actions.openDay(day, event)}
      onAuxClick={(event) => event.button === 1 && actions.open(journal.path, "tab")}
    >
      <Icon name="journal" className="size-[14px] shrink-0" />
      <span className="kasten-cal-journal-chip-label">Journal</span>
      {journal.excerpt && <span className="kasten-cal-journal-chip-text">{journal.excerpt}</span>}
    </button>
  );
}

/** "+", shown on hover: a menu of what to add on the day, and the journal
 * to write in. In a tag database's calendar it adds a note with the tag at
 * once. */
export function AddMenu({ day, scopeTag, className = "kasten-cal-add", wide = false, children }: { day: string; scopeTag: string | null; className?: string; wide?: boolean; children?: ReactNode }) {
  const actions = useCalendarActions();
  const face = children ?? <Icon name="plus" className="size-3.5" />;
  if (scopeTag) {
    return (
      <button type="button" className={className} aria-label={`Add on ${fullDay(day)}`} title={`Add a #${scopeTag} note on this day`} onClick={() => actions.addOn(day, "task")}>
        {face}
      </button>
    );
  }
  return (
    <Menu
      label={`Add on ${fullDay(day)}`}
      buttonClass={className}
      wrapClass={wide ? "flex w-full" : undefined}
      align="left"
      float
      items={[
        ...ADD_KINDS.map((k) => ({ label: k.label, hint: k.hint, icon: <Icon name={k.icon} className="size-4" />, onSelect: () => actions.addOn(day, k.kind) })),
        "divider" as const,
        { label: "Write in the journal", icon: <Icon name="journal" className="size-4" />, onSelect: () => actions.writeDay(day) },
      ]}
    >
      {face}
    </Menu>
  );
}

/** "New to-do…" and the like (in a tag database's calendar, "New #tag…"):
 * Enter adds it and stays for the next one, Esc closes. */
export function QuickAdd({ day, kind, scopeTag }: { day: string; kind: AddKind; scopeTag: string | null }) {
  const label = scopeTag ? `New #${scopeTag}` : addLabel(kind);
  const actions = useCalendarActions();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const title = text.trim();
    if (!title || busy) return;
    setBusy(true);
    const added = await actions.add(day, kind, title);
    setBusy(false);
    if (added) setText("");
  };
  return (
    <input
      autoFocus
      className="kasten-cal-input"
      placeholder={`${label}…`}
      aria-label={`${label} on ${fullDay(day)}`}
      aria-busy={busy || undefined}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void submit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          actions.addOn(null);
        }
      }}
      // Nothing typed, nothing to keep; typed words stay until Esc.
      onBlur={() => !text.trim() && !busy && actions.addOn(null)}
    />
  );
}

interface MoreProps {
  day: string;
  entries: readonly Entry[];
  colors: ReadonlyMap<string, string>;
  dragging: string | null;
  /** Opens upward (lower rows) and toward the start (last columns). */
  up: boolean;
  end: boolean;
}

/** Everything on a day, ranges over it first, over its cell; chips drag out
 * of it as usual. */
export function MorePopover({ day, entries, colors, dragging, up, end }: MoreProps) {
  const actions = useCalendarActions();
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
  }, []);
  return (
    <Popup label={`Everything on ${fullDay(day)}`} className={`kasten-cal-pop${up ? " is-up" : ""}${end ? " is-end" : ""}`} onClose={() => actions.expand(null)}>
      <div className="kasten-cal-pop-head">
        <span className="kasten-cal-pop-weekday">{weekdayOf(day)}</span>
        <span className="kasten-cal-pop-day">{Number(day.slice(8))}</span>
        <button ref={close} type="button" className="kasten-cal-pop-close" aria-label="Close" onClick={() => actions.expand(null)}>
          <Icon name="close" className="size-4" />
        </button>
      </div>
      <div className="kasten-cal-pop-list">
        {entries.map((entry) => (
          <EntryChip key={entryKey(entry)} entry={entry} colors={colors} dragging={dragging} day={day} />
        ))}
      </div>
    </Popup>
  );
}
