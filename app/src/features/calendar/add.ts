// What a day's "+" makes, each through the core's ops: a to-do
// in the day's journal, written `- [ ] … @2026-10-02` so it keeps its day
// wherever it moves; a task page due that day; a card or a page dated that
// day. A tag database's calendar adds a note with its tag instead.

import { dayFrom } from "../../lib/dates";
import type { TagSchema } from "../../lib/vault/types";
import type { IconName } from "../../ui/icons";
import { titleOf } from "../workspace/names";
import { useWorkspace } from "../workspace/store";
import type { NoteHome } from "../tags/home";
import type { AddKind } from "./actions";
import { dayLabel, newTaskProps } from "./layout";

export const ADD_KINDS: readonly { kind: AddKind; label: string; icon: IconName; hint: string }[] = [
  { kind: "todo", label: "To-do", icon: "todo", hint: "In the day’s journal" },
  { kind: "task", label: "Task", icon: "tasks", hint: "A #task due this day" },
  { kind: "note", label: "Note", icon: "card", hint: "A card on this day" },
  { kind: "page", label: "Page", icon: "page", hint: "A page on this day" },
];

/** What a quick-add field for `kind` is called: "New to-do". */
export const addLabel = (kind: AddKind) => `New ${ADD_KINDS.find((k) => k.kind === kind)!.label.toLowerCase()}`;

/** The date property a card or page made on a day carries. */
export const DAY_KEY = "date";

interface Context {
  /** A tag database's calendar: its tag, and the date property it shows. */
  scope?: { tag: string; date?: string };
  schemas: readonly TagSchema[] | null;
  /** Where a tag database's notes go (tags/home.ts). */
  home?: NoteHome;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Adds `title` as a `kind` on `day` and says so; false when it was refused. */
export async function addOnDay(kind: AddKind, day: string, title: string, { scope, schemas, home }: Context): Promise<boolean> {
  const ws = useWorkspace.getState();
  const when = dayLabel(day, dayFrom(0));
  if (scope || kind === "task") {
    const tag = scope?.tag ?? "task";
    const schema = schemas?.find((s) => s.name.toLowerCase() === tag.toLowerCase());
    const dateKey = scope?.date ?? schema?.properties.find((p) => p.type === "date")?.key ?? "due";
    const props = scope ? { [dateKey]: day } : newTaskProps(schema, day);
    // One commit: the page carries its tag and its day from the start.
    const note = await ws.create({ kind: "page", title, tags: [tag], props, project: scope ? (home?.project ?? null) : null, parent: scope ? (home?.parent ?? null) : null }, false);
    if (!note) return false;
    ws.toast(`Added “${titleOf(note.meta)}” on ${when}`, { label: "Open", run: () => ws.openPath(note.meta.path) });
    return true;
  }
  if (kind === "todo") {
    const path = await ws.ensureJournal(day);
    const client = useWorkspace.getState().client;
    if (!path || !client) return false;
    try {
      const journal = await client.append(path, `- [ ] ${title.replace(/\s+/g, " ")} @${day}`);
      useWorkspace.getState().noteChanged(journal.meta);
    } catch (err) {
      ws.toast(message(err));
      return false;
    }
    ws.toast(`Added a to-do on ${when}`, { label: "Open", run: () => ws.openPath(path, "peek") });
    return true;
  }
  const note = await ws.create({ kind: kind === "note" ? "card" : "page", title, props: { [DAY_KEY]: day } }, false);
  if (!note) return false;
  // A page is for writing: it opens at once, over the calendar.
  if (kind === "page") ws.openPath(note.meta.path, "peek");
  else ws.toast(`Added “${titleOf(note.meta)}” on ${when}`, { label: "Open", run: () => ws.openPath(note.meta.path, "peek") });
  return true;
}
