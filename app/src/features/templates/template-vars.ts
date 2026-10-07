// What a template's `{{…}}` placeholders become, as the core fills them
// (template_vars.rs): the title, day and project, the weekday, ISO week,
// month and year of the day, and the time. The app sends the person's own
// day and time as `2026-09-28T14:05` (`localStamp`).

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** `2026-09-28` or `2026-09-28T14:05`, split; null for anything else. */
export function dayAndTime(stamp: string): { day: string; time: string | null } | null {
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(stamp);
  if (!match) return null;
  if (match[2] !== undefined && (Number(match[2]) > 23 || Number(match[3]) > 59)) return null;
  return { day: match[1]!, time: match[2] === undefined ? null : `${match[2]}:${match[3]}` };
}

/** The person's day and time now, as the core reads it for templates. */
export function localStamp(date = new Date()): string {
  const pad = (n: number, size = 2) => String(n).padStart(size, "0");
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The weekday, ISO week (`2026-W40`), month and year of a day. */
export function calendarOf(day: string): { weekday: string; week: string; month: string; year: string } {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const days = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  const weekday = (((days + 3) % 7) + 7) % 7;
  const thursday = days - weekday + 3;
  const year = new Date(thursday * 86_400_000).getUTCFullYear();
  const week = Math.floor((thursday - Date.UTC(year, 0, 1) / 86_400_000) / 7) + 1;
  return { weekday: WEEKDAYS[weekday]!, week: `${year}-W${String(week).padStart(2, "0")}`, month: MONTHS[m - 1]!, year: day.slice(0, 4) };
}

/** The template with its placeholders filled. With the day alone, the
 * time is `now`'s in UTC, said so, as the core does. */
export function fillTemplate(text: string, title: string, stamp: string, project: string, now: Date = new Date()): string {
  const parsed = dayAndTime(stamp);
  const day = parsed?.day ?? stamp;
  const time = parsed?.time ?? `${now.toISOString().slice(11, 16)} UTC`;
  let out = text.replaceAll("{{date}}", day).replaceAll("{{project}}", project).replaceAll("{{time}}", time);
  if (parsed && out.includes("{{")) {
    const { weekday, week, month, year } = calendarOf(parsed.day);
    out = out.replaceAll("{{weekday}}", weekday).replaceAll("{{week}}", week).replaceAll("{{month}}", month).replaceAll("{{year}}", year);
  }
  // Last, so braces in a title stay as typed.
  return out.replaceAll("{{title}}", title);
}
