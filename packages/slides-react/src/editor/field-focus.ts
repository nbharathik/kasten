// "Go and edit this element's content": a double click on a composite opens the
// format options and puts the caret in its main field. The click is on the
// canvas and the field is in the panel, which may not be drawn yet, so the
// request waits here until the section of that element asks for it.

import { useEffect, useRef } from "react";

import type { EditorUi } from "./ui-state.ts";

/** How long a request is good for, in milliseconds: a section that appears much later is not what was asked for. */
const STALE = 2000;

interface Request {
  id: string;
  at: number;
}

const pending = new WeakMap<EditorUi, Request>();
const listeners = new WeakMap<EditorUi, Set<() => void>>();

/** What the name of a section in the filmstrip is asked for by. It is not an element, and it is known by the slide it starts at. */
export const sectionField = (startsAt: string): string => `section:${startsAt}`;

/** Asks for the main field of the element with this id to take the focus, as soon as its section is there. */
export function requestFieldFocus(ui: EditorUi, id: string): void {
  pending.set(ui, { id, at: Date.now() });
  for (const listener of [...(listeners.get(ui) ?? [])]) listener();
}

/** The request for one of these elements, if one is waiting and fresh; taken, so it is answered once. */
function take(ui: EditorUi, ids: readonly string[]): boolean {
  const request = pending.get(ui);
  if (!request || !ids.includes(request.id)) return false;
  pending.delete(ui);
  return Date.now() - request.at <= STALE;
}

/**
 * Calls `answer` when the main field of one of these elements is asked for:
 * at once if the request is already waiting (the panel has just opened), and
 * whenever a later one comes.
 */
export function useFieldFocus(ui: EditorUi, ids: readonly string[], answer: () => void): void {
  const latest = useRef(answer);
  latest.current = answer;
  const key = ids.join("\n");
  useEffect(() => {
    const wanted = key.split("\n");
    const check = () => {
      if (take(ui, wanted)) latest.current();
    };
    check();
    const set = listeners.get(ui) ?? new Set<() => void>();
    listeners.set(ui, set);
    set.add(check);
    return () => {
      set.delete(check);
    };
  }, [ui, key]);
}
