// A page opened after a crash puts back the typing that wasn't written yet,
// and its save keeps whatever changed in the note meanwhile.

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MemoryVault } from "../preview/memory-vault";
import { useNoteSession } from "./use-note-session";
import { writeUnsavedNow } from "./unsaved";

const PAGE = "---\nid: 01K5Y2WE1C0MEPAGE000000001\ntitle: Notes\n---\nFirst line\n";
const KEY = "kasten.unsaved:library/notes.md";

/** The preview vault, standing in for the desktop app's, which keeps typing. */
class DesktopVault extends MemoryVault {
  override readonly kind = "vault" as unknown as "preview";
}

const keep = (body: string, base: string, id: string | null) =>
  localStorage.setItem(KEY, JSON.stringify({ body, base, id, at: Date.now() }));

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  writeUnsavedNow();
});

describe("typing kept through a crash", () => {
  it("goes back into its page, is written, and is then forgotten", async () => {
    const vault = new DesktopVault({ "library/notes.md": PAGE });
    const note = await vault.read("library/notes.md");
    keep("Typed before the crash\n", note.hash, note.meta.id);

    const { result } = renderHook(() => useNoteSession(vault, "library/notes.md"));
    await waitFor(() => expect(result.current.loaded?.body).toBe("Typed before the crash\n"));
    await act(() => result.current.session.current!.flush());
    expect((await vault.read("library/notes.md")).text).toContain("Typed before the crash\n");
    writeUnsavedNow();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("keeps both versions when the note changed since", async () => {
    const vault = new DesktopVault({ "library/notes.md": PAGE });
    const note = await vault.read("library/notes.md");
    keep("Typed before the crash\n", note.hash, note.meta.id);
    await vault.saveBody("library/notes.md", "Changed on the laptop\n", note.hash);

    const { result } = renderHook(() => useNoteSession(vault, "library/notes.md"));
    await waitFor(() => expect(result.current.loaded?.body).toBe("Typed before the crash\n"));
    await act(() => result.current.session.current!.flush());
    const texts = await Promise.all((await vault.list()).map(async (n) => (await vault.read(n.path)).text));
    expect(texts.some((t) => t.includes("Typed before the crash"))).toBe(true);
    expect(texts.some((t) => t.includes("Changed on the laptop"))).toBe(true);
  });

  it("stays out of a note it wasn't typed in", async () => {
    const vault = new DesktopVault({ "library/notes.md": PAGE.replace("PAGE000000001", "OTHER00000001") });
    keep("Another vault's typing\n", "an-old-hash", "01K5Y2WE1C0MEPAGE000000001");
    const { result } = renderHook(() => useNoteSession(vault, "library/notes.md"));
    await waitFor(() => expect(result.current.loaded?.body).toBe("First line\n"));
    expect(localStorage.getItem(KEY)).toContain("Another vault's typing");
  });

  it("isn't kept at all in the browser preview", async () => {
    const vault = new MemoryVault({ "library/notes.md": PAGE });
    const note = await vault.read("library/notes.md");
    keep("Typed in the preview\n", note.hash, note.meta.id);
    const { result } = renderHook(() => useNoteSession(vault, "library/notes.md"));
    await waitFor(() => expect(result.current.loaded?.body).toBe("First line\n"));
  });
});
