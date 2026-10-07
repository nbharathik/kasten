// The browser preview's samples changed. An earlier preview's
// notes go, with the open tabs and recent pages that point into them. This
// runs once, before the workspace reads its layout, so nothing of the old
// samples stays. The desktop app never had these keys.

/** Where earlier previews kept their notes, and where the preview keeps them now. */
export const OLD_PREVIEW_KEY = "kasten.preview-vault";
export const PREVIEW_KEY = "kasten.preview-vault.2";

export function freshStart(storage: Pick<Storage, "getItem" | "removeItem">): boolean {
  if (storage.getItem(OLD_PREVIEW_KEY) === null || storage.getItem(PREVIEW_KEY) !== null) return false;
  for (const key of [OLD_PREVIEW_KEY, "kasten.layout", "kasten.recent"]) storage.removeItem(key);
  return true;
}

try {
  freshStart(localStorage);
} catch {
  // No storage: nothing was kept.
}
