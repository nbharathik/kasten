// Where an inbox note may belong: the project most of its similar notes
// are in, and the tags they share (from the core's related notes). Two
// notes must agree before anything is suggested.

import { useEffect, useMemo, useState } from "react";

import type { NoteMeta, RelatedNote } from "../../lib/vault/types";
import { projectTitle } from "../boards/store";
import { useWorkspace } from "../workspace/store";
import { noteAt } from "../workspace/tree";

export interface Home {
  project: { folder: string; title: string; count: number } | null;
  tags: string[];
}

/** Notes that must agree on a project or a tag. */
const AGREE = 2;
const MAX_TAGS = 3;

export function suggestHome(card: NoteMeta, similar: readonly RelatedNote[], notes: readonly NoteMeta[]): Home {
  const projects = new Map<string, number>();
  const tags = new Map<string, number>();
  const has = new Set(card.tags.map((t) => t.toLowerCase()));
  for (const found of similar) {
    const other = noteAt(notes, found.path);
    if (!other) continue;
    if (other.project && other.project !== card.project) projects.set(other.project, (projects.get(other.project) ?? 0) + 1);
    for (const tag of other.tags) if (!has.has(tag.toLowerCase())) tags.set(tag, (tags.get(tag) ?? 0) + 1);
  }
  // The most agreed on first; among equals, the one met first.
  const best = [...projects].reduce<[string, number] | null>((top, entry) => (!top || entry[1] > top[1] ? entry : top), null);
  return {
    project: best && best[1] >= AGREE ? { folder: best[0], title: projectTitle(notes, best[0]), count: best[1] } : null,
    tags: [...tags]
      .filter(([, count]) => count >= AGREE)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_TAGS)
      .map(([tag]) => tag),
  };
}

/** The suggested home of the card on show, once its similar notes are in. */
export function useSuggestedHome(card: NoteMeta | undefined): Home | null {
  const client = useWorkspace((s) => s.client);
  const notes = useWorkspace((s) => s.notes);
  const [similar, setSimilar] = useState<{ path: string; found: RelatedNote[] } | null>(null);
  const path = card?.path;
  useEffect(() => {
    if (!client || !path) return;
    let live = true;
    client.related(path, 8).then(
      (found) => live && setSimilar({ path, found }),
      () => live && setSimilar({ path, found: [] }),
    );
    return () => {
      live = false;
    };
  }, [client, path]);
  return useMemo(() => (card && similar?.path === card.path ? suggestHome(card, similar.found, notes) : null), [card, similar, notes]);
}
