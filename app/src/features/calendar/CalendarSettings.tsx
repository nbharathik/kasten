// Settings → Calendar: the day weeks start on, and what the Calendar shows
// on its days, the same switches as its Show menu.

import { usePrefs, type WeekStart } from "../workspace/prefs";
import { Group, Row, Segmented, Switch } from "../workspace/views/settings/parts";
import { SHOW_OPTIONS } from "./show";

export function CalendarSettings() {
  const show = usePrefs((s) => s.calendarShow);
  const weekStart = usePrefs((s) => s.weekStart);
  return (
    <Group title="Calendar" detail="What each day shows. A click on a day opens its journal; its + adds a to-do, a task, a note or a page on it.">
      <Row label="Weeks start on" detail="For the Calendar and the journal's month">
        <Segmented<"1" | "0" | "6">
          label="Weeks start on"
          value={String(weekStart) as "1" | "0" | "6"}
          options={[
            { id: "1", label: "Monday" },
            { id: "0", label: "Sunday" },
            { id: "6", label: "Saturday" },
          ]}
          onChange={(day) => usePrefs.getState().set({ weekStart: Number(day) as WeekStart })}
        />
      </Row>
      {SHOW_OPTIONS.map((option) => (
        <Switch key={option.key} label={option.label} detail={option.detail} checked={show[option.key]} onChange={(on) => usePrefs.getState().set({ calendarShow: { ...usePrefs.getState().calendarShow, [option.key]: on } })} />
      ))}
    </Group>
  );
}
