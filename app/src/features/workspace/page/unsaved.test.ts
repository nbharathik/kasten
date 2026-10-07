// Typing not yet written is kept on this computer until it is, and goes
// back only into the note it was typed in.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NoteFile } from "../../../lib/vault/types";
import { keepUnsaved, toRestore, unsavedFor, writeUnsavedNow, type Unsaved } from "./unsaved";

const note = (hash: string, id: string | null = "01K5Y2WE1C0MEPAGE000000001") => ({ hash, meta: { id } }) as unknown as NoteFile;
const typed = (over: Partial<Unsaved> = {}): Unsaved => ({ body: "Typed\n", base: "h1", id: "01K5Y2WE1C0MEPAGE000000001", at: Date.now(), ...over });

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});
afterEach(() => {
  writeUnsavedNow();
  vi.useRealTimers();
});

describe("unsaved typing", () => {
  it("reaches storage a moment after typing, or at once when the window goes", () => {
    keepUnsaved("library/notes.md", typed());
    expect(unsavedFor("library/notes.md")?.body).toBe("Typed\n");
    expect(localStorage.getItem("kasten.unsaved:library/notes.md")).toBeNull();
    vi.advanceTimersByTime(300);
    expect(JSON.parse(localStorage.getItem("kasten.unsaved:library/notes.md")!).body).toBe("Typed\n");

    keepUnsaved("library/notes.md", null);
    writeUnsavedNow();
    expect(localStorage.getItem("kasten.unsaved:library/notes.md")).toBeNull();
    expect(unsavedFor("library/notes.md")).toBeNull();
  });

  it("goes back into the note it was typed in, and nowhere else", () => {
    expect(toRestore(typed(), note("h1"), "Saved\n")).toBe("restore");
    // The note changed since: its save joins the two or keeps a copy.
    expect(toRestore(typed(), note("h2"), "Saved\n")).toBe("restore");
    expect(toRestore(typed(), note("h2"), "Typed\n")).toBe("forget");
    // Another vault's note at the same path.
    expect(toRestore(typed(), note("h2", "01K5OTHERNOTE0000000000000"), "Saved\n")).toBe("leave");
    expect(toRestore(typed({ id: null }), note("h2", null), "Saved\n")).toBe("leave");
    expect(toRestore(null, note("h1"), "Saved\n")).toBe("leave");
  });

  it("forgets what is a month old, and what isn't its own shape", () => {
    localStorage.setItem("kasten.unsaved:old.md", JSON.stringify(typed({ at: Date.now() - 31 * 24 * 3600_000 })));
    expect(unsavedFor("old.md")).toBeNull();
    expect(localStorage.getItem("kasten.unsaved:old.md")).toBeNull();
    localStorage.setItem("kasten.unsaved:odd.md", "{not json");
    expect(unsavedFor("odd.md")).toBeNull();
    localStorage.setItem("kasten.unsaved:odd.md", JSON.stringify({ body: 3 }));
    expect(unsavedFor("odd.md")).toBeNull();
  });
});
