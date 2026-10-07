// The page a new vault opens on: a starter kit's home page, picked when
// the vault was made. The app restarts on a new vault, so the choice waits
// in this window's storage until the vault is open.

import { useEffect } from "react";

import { useWorkspace } from "../workspace/store";

const KEY = "kasten.first-page";

export function openOnFirstRun(path: string): void {
  try {
    localStorage.setItem(KEY, path);
  } catch {
    // Storage off: the vault opens on Home, as usual.
  }
}

/** Opens the page waiting for the new vault, once, when it is ready. */
export function useFirstPage(): void {
  const ready = useWorkspace((s) => s.ready);
  useEffect(() => {
    if (!ready) return;
    let path: string | null = null;
    try {
      path = localStorage.getItem(KEY);
      localStorage.removeItem(KEY);
    } catch {
      return;
    }
    const ws = useWorkspace.getState();
    if (path && ws.notes.some((n) => n.path === path)) ws.openPath(path);
  }, [ready]);
}
