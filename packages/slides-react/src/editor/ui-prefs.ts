// Window choices the person makes once and expects to find again in this browser. Browser storage can be missing, full or refused
// (a private window, blocked site data): then nothing is remembered and the editor works as it does at first.

/** Whether the filmstrip shows the badges that flag problems on its slides ("1" or "0"). */
export const LINT_BADGES_KEY = "ks-lint-badges";

/** A yes or no kept under `key`; `fallback` when there is none, or it cannot be read. */
export function readFlag(key: string, fallback: boolean): boolean {
  try {
    const stored = localStorage.getItem(key);
    return stored === "1" ? true : stored === "0" ? false : fallback;
  } catch {
    return fallback;
  }
}

export function writeFlag(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    // Nothing is remembered; the choice still holds for this window.
  }
}
