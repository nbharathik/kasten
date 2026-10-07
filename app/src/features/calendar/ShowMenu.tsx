// The header's Show menu: which kinds of things the Calendar puts on its
// days. Each is a switch that keeps the menu open; Settings has the same.

import { useRef, useState } from "react";

import { Icon } from "../../ui/Icon";
import { Popup } from "../pages/page/Popup";
import { usePrefs } from "../workspace/prefs";
import { hiddenCount, SHOW_OPTIONS } from "./show";

export function ShowMenu() {
  const show = usePrefs((s) => s.calendarShow);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const hidden = hiddenCount(show);
  return (
    <span className="relative inline-flex">
      <button
        ref={button}
        type="button"
        className="kasten-cal-today kasten-cal-show"
        aria-expanded={open}
        aria-haspopup="true"
        title="What the calendar shows"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="eye" className="size-4" />
        Show
        {hidden > 0 && <span className="kasten-cal-show-count" aria-label={`${hidden} hidden`}>{hidden}</span>}
      </button>
      {open && (
        <Popup label="Show on the calendar" anchor={button} onClose={() => setOpen(false)} className="kasten-cal-showmenu">
          <p className="kasten-cal-showmenu-head">Show on the calendar</p>
          {SHOW_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              role="menuitemcheckbox"
              aria-checked={show[option.key]}
              className="kasten-cal-showmenu-item"
              onClick={() => usePrefs.getState().set({ calendarShow: { ...usePrefs.getState().calendarShow, [option.key]: !show[option.key] } })}
            >
              <span className="kasten-cal-showmenu-check" aria-hidden="true">
                {show[option.key] && <Icon name="check" className="size-3.5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block">{option.label}</span>
                <span className="kasten-cal-showmenu-detail">{option.detail}</span>
              </span>
            </button>
          ))}
        </Popup>
      )}
    </span>
  );
}
