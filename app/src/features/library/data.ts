// What the Card Library asks the vault for besides the note list: link and
// board counts, full-text matches and tag colours. Each is one index query
// through the client; nothing reads notes one by one.

import { useCallback, useEffect, useRef, useState } from "react";

import type { Hit, NoteMeta, NoteStats, VaultClient } from "../../lib/vault/types";

/** How long after the notes change the counts are fetched again. */
const STATS_DELAY = 400;
/** How long typing pauses before the full-text search runs. */
export const SEARCH_DELAY = 150;
const SEARCH_LIMIT = 200;

/** Link and board counts by path: fetched on arrival, then again (debounced)
 * whenever the notes change or `reload` is called. Null until the first answer. */
export function useNoteStats(client: VaultClient | null, notes: NoteMeta[]): { stats: Map<string, NoteStats> | null; reload: () => void } {
  const [stats, setStats] = useState<Map<string, NoteStats> | null>(null);
  const [asked, setAsked] = useState(0);
  const fetched = useRef(false);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    const timer = setTimeout(
      () => {
        fetched.current = true;
        client.noteStats().then(
          (list) => !cancelled && setStats(new Map(list.map((s) => [s.path, s]))),
          // Without counts the board filters wait; everything else works.
          () => {},
        );
      },
      fetched.current ? STATS_DELAY : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, notes, asked]);

  const reload = useCallback(() => setAsked((n) => n + 1), []);
  return { stats, reload };
}

/** Full-text matches for `query` after a short pause, by path; null while
 * there is no query or its answer has not come yet. */
export function useFullText(client: VaultClient | null, query: string, notes: NoteMeta[]): Map<string, Hit> | null {
  const [found, setFound] = useState<{ query: string; hits: Map<string, Hit> } | null>(null);
  const text = query.trim();

  useEffect(() => {
    if (!client || !text) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      client.search(text, SEARCH_LIMIT).then(
        (hits) => !cancelled && setFound({ query: text, hits: new Map(hits.map((h) => [h.path, h])) }),
        // A query the index cannot read finds nothing extra.
        () => !cancelled && setFound({ query: text, hits: new Map() }),
      );
    }, SEARCH_DELAY);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, text, notes]);

  // An answer for an older query would show the wrong cards.
  return found && found.query === text ? found.hits : null;
}

/** Each tag's colour from its schema (`tags/<name>.yaml`), by lower-case name. */
export function useTagColors(client: VaultClient | null): Record<string, string> {
  const [colors, setColors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    client.tagSchemas().then(
      (schemas) => !cancelled && setColors(Object.fromEntries(schemas.filter((s) => s.color).map((s) => [s.name.toLowerCase(), s.color!]))),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [client]);
  return colors;
}
