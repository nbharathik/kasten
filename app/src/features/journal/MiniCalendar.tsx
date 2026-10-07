import { useState } from "react";

import { IconButton } from "../../ui/Button";
import { monthGrid, monthTitle, weekdayNames } from "../calendar/dates";
import type { DayMark } from "./feed";
import { usePrefs } from "../workspace/prefs";

interface MiniCalendarProps {
  today: string;
  /** The day the journal shows. */
  current: string | null;
  marks: Map<string, DayMark>;
  onPick: (day: string) => void;
}

const month = (day: string) => {
  const [y, m] = day.split("-").map(Number);
  return { year: y!, month: m! - 1 };
};

/** A month at a glance: days with a page get a filled dot, days with other
 * notes or things due a faint one; clicking a day jumps to it. */
export function MiniCalendar({ today, current, marks, onPick }: MiniCalendarProps) {
  const [shown, setShown] = useState(() => month(today));
  const step = (by: number) => setShown(({ year, month: m }) => ({ year: m + by < 0 ? year - 1 : m + by > 11 ? year + 1 : year, month: (m + by + 12) % 12 }));
  const weekStart = usePrefs((s) => s.weekStart);
  const grid = monthGrid(shown.year, shown.month, weekStart);
  const inMonth = (day: string) => month(day).month === shown.month;

  return (
    <section aria-label="Month" className="kasten-mini-cal">
      <header className="flex items-center gap-1">
        <h2 className="flex-1 text-13 font-semibold">{monthTitle(shown.year, shown.month)}</h2>
        <IconButton icon="chevron-left" label="Previous month" size="sm" onClick={() => step(-1)} />
        <IconButton icon="circle-dot" label="This month" size="sm" iconClass="size-3" onClick={() => setShown(month(today))} />
        <IconButton icon="chevron" label="Next month" size="sm" onClick={() => step(1)} />
      </header>
      <div className="mt-2 grid grid-cols-7 text-center text-11 font-medium text-muted">
        {weekdayNames(weekStart, "narrow").map((name, i) => (
          <span key={i}>{name}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-y-0.5 text-center">
        {grid.flat().map((day) => {
          const mark = marks.get(day);
          const label = [day, mark?.journal && "journal page", mark?.activity && `${mark.activity} notes`, mark?.due && `${mark.due} due`, mark?.ongoing && `${mark.ongoing} ongoing`].filter(Boolean).join(", ");
          return (
            <button
              key={day}
              type="button"
              aria-label={label}
              aria-current={day === today ? "date" : undefined}
              data-day={day}
              onClick={() => onPick(day)}
              className={`kasten-mini-day${inMonth(day) ? "" : " is-other"}${day === today ? " is-today" : ""}${day === current ? " is-current" : ""}`}
            >
              {Number(day.slice(8))}
              <span className={`kasten-mini-dot${mark?.journal ? " is-journal" : mark && (mark.activity || mark.due || mark.ongoing) ? " is-activity" : ""}`} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
