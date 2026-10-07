// Which notes carry agent marks, for the ✦ on board cards and Card Library
// rows: one call for all of a view's notes,
// asked again when the notes change or a page accepts its marks.

import { useEffect, useMemo, useRef, useState } from "react";

import type { VaultClient } from "../../lib/vault/types";
import { useWorkspace } from "../workspace/store";

/** How long after the notes change the marks are asked for again. */
const DELAY = 400;
const NONE: ReadonlySet<string> = new Set();

const listeners = new Set<() => void>();

/** Tells the views that marks changed with no file changing (an accept). */
export function agentMarksChanged(): void {
  for (const listener of listeners) listener();
}

const same = (a: ReadonlySet<string>, b: readonly string[]) => a.size === b.length && b.every((p) => a.has(p));

/** The notes among `paths` with agent marks; none until the first answer. */
export function useAgentMarked(client: VaultClient | null, paths: readonly string[]): ReadonlySet<string> {
  const notes = useWorkspace((s) => s.notes);
  const [marked, setMarked] = useState<ReadonlySet<string>>(NONE);
  const [asked, setAsked] = useState(0);
  const fetched = useRef(false);
  const key = useMemo(() => paths.join("\n"), [paths]);

  useEffect(() => {
    const listener = () => setAsked((n) => n + 1);
    listeners.add(listener);
    return () => void listeners.delete(listener);
  }, []);

  useEffect(() => {
    if (!client || !key) return;
    let live = true;
    const timer = setTimeout(
      () => {
        fetched.current = true;
        Promise.resolve(key.split("\n")).then((paths) => client.agentMarked(paths)).then(
          (found) => live && setMarked((was) => (same(was, found) ? was : new Set(found))),
          // Without an answer the badges wait; nothing else depends on them.
          () => {},
        );
      },
      fetched.current ? DELAY : 0,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [client, key, notes, asked]);

  return key ? marked : NONE;
}
