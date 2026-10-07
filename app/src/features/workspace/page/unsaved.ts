// Typing not yet written to the vault, kept in this computer's browser
// storage until it is: a crash, a killed app or a save that keeps failing
// then loses nothing, and opening the page again puts the typing back.
// Only the desktop app keeps it; the browser preview starts fresh anyway.

import type { NoteFile } from "../../../lib/vault/types";

const PREFIX = "kasten.unsaved:";
/** Writes to storage wait this long, so typing doesn't write on every key. */
const DELAY_MS = 300;
/** Typing kept longer than this without its page being opened goes. */
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;

export interface Unsaved {
  body: string;
  /** The hash of the version the typing was done on. */
  base: string;
  /** The note's id, so typing only ever goes back into the same note. */
  id: string | null;
  at: number;
}

const waiting = new Map<string, Unsaved | null>();
let timer: ReturnType<typeof setTimeout> | null = null;

const key = (path: string) => PREFIX + path;

/** Keeps the typing waiting for `path`, or forgets it with null. */
export function keepUnsaved(path: string, unsaved: Unsaved | null): void {
  waiting.set(path, unsaved);
  timer ??= setTimeout(writeUnsavedNow, DELAY_MS);
}

/** Puts what is waiting into storage now, as the window closes or hides. */
export function writeUnsavedNow(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  for (const [path, unsaved] of waiting) {
    try {
      if (unsaved) localStorage.setItem(key(path), JSON.stringify(unsaved));
      else localStorage.removeItem(key(path));
    } catch {
      // Storage full or blocked: the save to the vault still runs.
    }
  }
  waiting.clear();
}

/** The typing kept for `path`, if any. */
export function unsavedFor(path: string, now = Date.now()): Unsaved | null {
  if (waiting.has(path)) return waiting.get(path) ?? null;
  try {
    const raw = localStorage.getItem(key(path));
    if (!raw) return null;
    const found = JSON.parse(raw) as Partial<Unsaved>;
    if (typeof found.body !== "string" || typeof found.base !== "string" || typeof found.at !== "number") return null;
    if (now - found.at > KEEP_MS) {
      localStorage.removeItem(key(path));
      return null;
    }
    return { body: found.body, base: found.base, id: typeof found.id === "string" ? found.id : null, at: found.at };
  } catch {
    return null;
  }
}

/** What to do with typing kept for a note as it opens: put it back when it
 * was typed on this version, or on an earlier version of this same note
 * (its save then joins the two or keeps a copy); forget it when the note
 * already says it; else leave it, since it may be another vault's. */
export function toRestore(unsaved: Unsaved | null, note: NoteFile, body: string): "restore" | "forget" | "leave" {
  if (!unsaved) return "leave";
  if (unsaved.body === body) return "forget";
  if (unsaved.base === note.hash) return "restore";
  if (unsaved.id !== null && unsaved.id === note.meta.id) return "restore";
  return "leave";
}
