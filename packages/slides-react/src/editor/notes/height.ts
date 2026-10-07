// How tall the notes pane is, and that the person's choice is remembered.

export const MIN_HEIGHT = 60;
export const MAX_HEIGHT = 320;
export const DEFAULT_HEIGHT = 112;

const KEY = "ks-notes-height";

export const clampHeight = (height: number): number => Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(height)));

/** The height last chosen, or the usual one. Browser storage can be missing or refuse, and then nothing is remembered. */
export function readHeight(): number {
  try {
    const height = Number(localStorage.getItem(KEY));
    return Number.isFinite(height) && height > 0 ? clampHeight(height) : DEFAULT_HEIGHT;
  } catch {
    return DEFAULT_HEIGHT;
  }
}

export function saveHeight(height: number): void {
  try {
    localStorage.setItem(KEY, String(clampHeight(height)));
  } catch {
    // A private window, or site data that is blocked: the height just is not remembered.
  }
}
