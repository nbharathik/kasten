// Once a week the desktop app checks the vault (`kasten verify`) while the
// person is idle, and speaks only when it finds something: a notice that
// opens Settings at History and backup, where "Check now" lists it all.

import { useEffect } from "react";

import { useWorkspace } from "./store";
import { openSettingsAt } from "./views/settings/jump";

const KEY = "kasten.weeklyCheck";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** How long after opening the vault the check waits, so it never slows the start. */
const AFTER_MS = 2 * 60 * 1000;

/** When the vault `label` was last checked, from what this browser keeps. */
function lastCheck(label: string): number | null {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, number>;
    return typeof all[label] === "number" ? all[label] : null;
  } catch {
    return null;
  }
}

function remember(label: string, at: number): void {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, number>;
    localStorage.setItem(KEY, JSON.stringify({ ...all, [label]: at }));
  } catch {
    // Storage full or blocked: the check runs again next time.
  }
}

/** Whether a check last run at `last` is due at `now`. */
export const checkDue = (last: number | null, now: number) => last === null || now - last >= WEEK_MS;

/** Runs the check now if it is due; true when it ran. */
export async function weeklyCheck(now = Date.now()): Promise<boolean> {
  const { client, toast } = useWorkspace.getState();
  if (!client || client.kind === "preview" || !checkDue(lastCheck(client.label), now)) return false;
  try {
    const report = await client.verify();
    remember(client.label, now);
    const n = report.problems.length;
    if (n > 0) toast(`The weekly vault check found ${n} ${n === 1 ? "thing" : "things"} to look at`, { label: "Show", run: () => openSettingsAt("History and backup") });
  } catch {
    // A check that could not run tries again next time the app opens.
  }
  return true;
}

/** Schedules the weekly check a while after a vault opens. */
export function useWeeklyCheck(): void {
  const client = useWorkspace((s) => s.client);
  useEffect(() => {
    if (!client || client.kind === "preview") return;
    const timer = setTimeout(() => void weeklyCheck(), AFTER_MS);
    return () => clearTimeout(timer);
  }, [client]);
}
