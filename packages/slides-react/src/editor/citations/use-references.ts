import { type Reference, referenceList, referencesVersion, subscribeReferences } from "@kasten-slides/wasm";
import { useSyncExternalStore } from "react";

/** The page's bibliography, drawn again when the host gives another; null when the host has none. */
export function useReferences(): readonly Reference[] | null {
  useSyncExternalStore(subscribeReferences, referencesVersion, referencesVersion);
  return referenceList();
}
