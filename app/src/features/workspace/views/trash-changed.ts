// Tells the Trash view to read the trash again after a change that moves
// no note in or out of the vault's list: emptying it, or undoing that.

import { useSyncExternalStore } from "react";

let version = 0;
const listeners = new Set<() => void>();

export function trashChanged(): void {
  version++;
  for (const listener of listeners) listener();
}

/** A number that changes whenever the trash did. */
export function useTrashVersion(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
  );
}
