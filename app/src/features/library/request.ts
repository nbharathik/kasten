// Asks the Card Library to show a search: Ctrl+Shift+F, a tag in the
// palette or a tag chip anywhere. A Library already open takes the query at
// once; one about to open takes it when it mounts.

import { useEffect, useRef } from "react";

import { useWorkspace } from "../workspace/store";

type Listener = (query: string) => void;

let pending: string | null = null;
const listeners = new Set<Listener>();

/** Opens the Card Library searching for `query` ("" just focuses the box). */
export function searchLibrary(query = ""): void {
  pending = query;
  useWorkspace.getState().go({ view: "library" });
  for (const listener of listeners) listener(query);
  if (listeners.size) pending = null;
}

/** Cards with this tag, in the Card Library. */
export const showTag = (tag: string) => searchLibrary(`tag:${tag.includes(" ") ? `"${tag}"` : tag}`);

/** Lets the Library take requests: the one waiting, then each new one. */
export function useLibraryRequests(onQuery: Listener): void {
  const handler = useRef(onQuery);
  useEffect(() => {
    handler.current = onQuery;
  }, [onQuery]);
  useEffect(() => {
    const listener: Listener = (query) => handler.current(query);
    if (pending !== null) {
      const query = pending;
      pending = null;
      // After the first paint, so the box exists to take the focus.
      requestAnimationFrame(() => listener(query));
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
}
