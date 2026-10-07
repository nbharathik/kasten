// What is open in the window, for the chat's context: the page of every
// pane, the side stack's pages and a peek, each once.

import { useMemo } from "react";

import type { NoteMeta } from "../../lib/vault/types";
import { usePeek } from "../peek/store";
import { useWorkspace } from "../workspace/store";
import { activeTab } from "../workspace/tabs";
import { noteAt } from "../workspace/tree";

/** The paths of the notes open, focused pane first. */
export function openPaths(state: ReturnType<typeof useWorkspace.getState>, peek: string | null): string[] {
  const { layout, stack, stackOpen } = state;
  const panes = [...layout.panes].sort((a, b) => Number(b.id === layout.focus) - Number(a.id === layout.focus));
  const paths = panes.map((pane) => activeTab(pane).place).filter((place) => (place.view === "page" || place.view === "journal") && place.path).map((place) => place.path!);
  return [...new Set([...(peek ? [peek] : []), ...paths, ...(stackOpen ? stack : [])])].filter((path) => path.endsWith(".md"));
}

/** The notes open, as the list has them, focused first. */
export function useOpenNotes(): NoteMeta[] {
  const peek = usePeek((s) => s.peek?.path ?? null);
  const key = useWorkspace((s) => openPaths(s, peek).join("\\n"));
  const notes = useWorkspace((s) => s.notes);
  return useMemo(
    () =>
      key
        .split("\\n")
        .filter(Boolean)
        .map((path) => noteAt(notes, path))
        .filter((note): note is NoteMeta => Boolean(note)),
    [key, notes],
  );
}
