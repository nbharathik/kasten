// A quick capture, from any box in the app: the core's capture op makes the
// card (its first line the title, the rest the body), in the Inbox
// or a project's cards. Grouping for the Inbox's list lives here too.

import type { NoteMeta } from "../../lib/vault/types";
import { isoDay } from "../../lib/dates";
import { titleOf } from "./names";
import { useWorkspace } from "./store";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Saves `markdown` as a card and says so; `open` goes straight to it, to
 * keep writing. Null when there was nothing to save or it was refused. */
export async function captureThought(markdown: string, where: { project?: string | null; open?: boolean } = {}): Promise<NoteMeta | null> {
  const { client, noteChanged, toast, openPath } = useWorkspace.getState();
  if (!client || !markdown.trim()) return null;
  try {
    const card = await client.capture(markdown, [], where.project ?? null);
    noteChanged(card.meta);
    if (where.open) openPath(card.meta.path);
    else toast(`Saved “${titleOf(card.meta)}” ${where.project ? "in this project" : "to the Inbox"}`, { label: "Open", run: () => openPath(card.meta.path) });
    return card.meta;
  } catch (err) {
    toast(message(err));
    return null;
  }
}

/** When a card was caught: its `created` stamp, else its file's time. */
export function caughtAt(note: Pick<NoteMeta, "created" | "modified">): number {
  const created = note.created ? Date.parse(note.created) : NaN;
  return Number.isNaN(created) ? note.modified : created;
}

/** Cards by the day they were caught, newest day first: "Today",
 * "Yesterday", a weekday within the week, then the date. */
export function byDay<T extends Pick<NoteMeta, "created" | "modified">>(cards: readonly T[], now = new Date()): { label: string; cards: T[] }[] {
  const today = isoDay(now);
  const yesterday = isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const weekAgo = isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
  const groups = new Map<string, T[]>();
  for (const card of [...cards].sort((a, b) => caughtAt(b) - caughtAt(a))) {
    const day = isoDay(new Date(caughtAt(card)));
    groups.set(day, [...(groups.get(day) ?? []), card]);
  }
  return [...groups].map(([day, list]) => {
    const date = new Date(`${day}T12:00:00`);
    const label =
      day === today
        ? "Today"
        : day === yesterday
          ? "Yesterday"
          : day >= weekAgo
            ? date.toLocaleDateString(undefined, { weekday: "long" })
            : date.toLocaleDateString(undefined, { day: "numeric", month: "long", ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }) });
    return { label, cards: list };
  });
}
