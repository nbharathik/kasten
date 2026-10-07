// Date and checkbox cells. A date reads as "2 Oct 2026" and edits with the
// day picker: a picked day saves after a short pause (so typing a date
// digit by digit saves once), Enter or leaving saves at once, Escape
// leaves an unsaved change. A checkbox toggles on click or Space.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { dayOf, isChecked, movedValue } from "../../../../panel/properties/values";
import { useLatest, type Move } from "../context";
import { readableDate } from "../format";
import type { TypeCellProps } from "./types";

export function DateCell({ value, editing, label, save, finish }: TypeCellProps) {
  if (editing) return <DateInput value={value} label={label} save={save} finish={finish} />;
  const text = readableDate(value);
  return text ? <span className="kasten-table-text">{text}</span> : null;
}

const PAUSE = 500;

function DateInput({ value, label, save, finish }: Pick<TypeCellProps, "value" | "label" | "save" | "finish">) {
  const [draft, setDraft] = useState(dayOf(value));
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const written = useRef(dayOf(value));
  const closed = useRef(false);
  const latest = useLatest({ draft, save, value });

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const commit = useCallback(() => {
    stop();
    const { draft, save, value } = latest.current;
    if (draft === written.current) return;
    written.current = draft;
    // A time after the date stays.
    save(draft ? movedValue(value, draft) : null);
  }, [latest, stop]);

  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    try {
      el.showPicker?.();
    } catch {
      // Only allowed right after a click or key; the field works without it.
    }
  }, []);

  // A date still waiting when the row scrolls out of view is kept.
  useEffect(
    () => () => {
      if (!closed.current) commit();
    },
    [commit],
  );

  const close = (keep: boolean, move: Move, refocus: boolean) => {
    if (closed.current) return;
    closed.current = true;
    if (keep) commit();
    else stop();
    finish(move, refocus);
  };

  return (
    <input
      ref={input}
      type="date"
      className="kasten-table-input"
      aria-label={label}
      value={draft}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        stop();
        // While a year is typed digit by digit it reads 0002, 0020…; wait for a real one.
        if (next === "" || Number(next.slice(0, 4)) >= 1000) timer.current = setTimeout(commit, PAUSE);
      }}
      onBlur={() => close(true, null, false)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          close(true, null, true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          close(false, null, true);
        } else if (e.key === "Tab" && !e.ctrlKey && !e.altKey && !e.metaKey) {
          e.preventDefault();
          close(true, e.shiftKey ? "prev" : "next", true);
        }
      }}
    />
  );
}

export function CheckCell({ value, label, save }: TypeCellProps) {
  const checked = isChecked(value);
  return (
    <input
      type="checkbox"
      className="kasten-table-check"
      aria-label={label}
      checked={checked}
      // Keys stay with the grid: Space toggles through it.
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      onChange={() => save(!checked)}
    />
  );
}
