import { describe, expect, it, vi } from "vitest";

import { MemoryVault } from "../preview/memory-vault";
import { PageSession, RETRY_MS, type SessionEvents } from "./page-session";

const PAGE = "---\nid: 01K5Y2WE1C0MEPAGE000000001\ntitle: Notes\nupdated: 2026-09-23T08:00:00Z\n---\nFirst line\n";
const NOW = Date.UTC(2026, 8, 24, 8, 0, 0);

function setup() {
  const vault = new MemoryVault({ "library/notes.md": PAGE }, undefined, () => NOW);
  const events = { onState: vi.fn(), onNote: vi.fn(), onRenamed: vi.fn(), onConflict: vi.fn(), onMerged: vi.fn(), onError: vi.fn() } satisfies SessionEvents;
  return { vault, events, open: async () => new PageSession(vault, "library/notes.md", await vault.read("library/notes.md"), events, 10_000) };
}

describe("PageSession", () => {
  it("keeps what a failed save did not write, and tries again by itself", async () => {
    vi.useFakeTimers();
    try {
      const { vault, events, open } = setup();
      const session = await open();
      const saveBody = vault.saveBody.bind(vault);
      let failures = 1;
      vi.spyOn(vault, "saveBody").mockImplementation((path, body, base) => (failures-- > 0 ? Promise.reject(new Error("The file is locked by another program")) : saveBody(path, body, base)));
      session.editBody("Typed before the failure\n");
      await session.flush();
      expect(events.onState).toHaveBeenLastCalledWith("failed");
      expect(events.onError).toHaveBeenCalledWith("The file is locked by another program");
      expect(session.busy).toBe(true);
      // Nobody types again: the session retries on its own.
      await vi.advanceTimersByTimeAsync(RETRY_MS[0]!);
      expect(events.onState).toHaveBeenLastCalledWith("saved");
      expect((await vault.read("library/notes.md")).text).toContain("Typed before the failure\n");
      expect(session.busy).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("remembers the body as the vault wrote it, so a page with no frontmatter keeps a rule on top", async () => {
    const vault = new MemoryVault({ "library/loose.md": "Intro\n\n---\n\nMore\n" }, undefined, () => NOW);
    const events = { onState: vi.fn(), onNote: vi.fn(), onRenamed: vi.fn(), onConflict: vi.fn(), onMerged: vi.fn(), onError: vi.fn() } satisfies SessionEvents;
    const session = new PageSession(vault, "library/loose.md", await vault.read("library/loose.md"), events, 10_000);
    session.editBody("---\n\nIntro\n\n---\n\nMore\n");
    await session.flush();
    const note = await vault.read("library/loose.md");
    expect(note.text).toBe("***\n\nIntro\n\n---\n\nMore\n");
    expect(note.meta.title).toBe("loose");
    // A change made from the side panel is taken in, not a reason to reload.
    expect(session.adopt(note)).toBe(true);
  });

  it("writes nothing for an unchanged body", async () => {
    const { vault, events, open } = setup();
    const session = await open();
    session.editBody("First line\n");
    await session.flush();
    expect(events.onState).not.toHaveBeenCalled();
    expect((await vault.read("library/notes.md")).text).toBe(PAGE);
  });

  it("saves the latest body and header edits in one go, header first", async () => {
    const { vault, events, open } = setup();
    const session = await open();
    session.editBody("Draft\n");
    session.editHeader("icon", "🚀");
    session.rename("Notes: day one");
    session.editBody("Second draft\n");
    expect(session.busy).toBe(true);
    await session.flush();
    expect(session.path).toBe("library/notes-day-one.md");
    expect(events.onRenamed).toHaveBeenCalledWith("library/notes.md", expect.objectContaining({ relinked: [] }));
    const text = (await vault.read(session.path)).text;
    expect(text).toBe(
      PAGE.replace("title: Notes", 'title: "Notes: day one"')
        .replace("2026-09-23T08:00:00Z", "2026-09-24T08:00:00Z")
        .replace("---\nFirst line", "icon: 🚀\n---\nSecond draft"),
    );
    expect(events.onState).toHaveBeenLastCalledWith("saved");
    expect(events.onNote).toHaveBeenCalledTimes(2);
    expect(session.busy).toBe(false);
    expect(session.currentHash).toBe((await vault.read(session.path)).hash);
  });

  it("keeps the editor's version as a copy when the file changed meanwhile", async () => {
    const { vault, events, open } = setup();
    const session = await open();
    const loaded = await vault.read("library/notes.md");
    await vault.saveBody("library/notes.md", "Changed elsewhere\n", loaded.hash);
    session.editBody("Mine\n");
    await session.flush();
    expect(events.onConflict).toHaveBeenCalledTimes(1);
    const [copy] = events.onConflict.mock.calls[0]!;
    expect(copy).toBe("library/notes (conflict 2026-09-24 08-00).md");
    expect((await vault.read(copy)).text).toContain("Mine\n");
    expect((await vault.read("library/notes.md")).text).toContain("Changed elsewhere\n");
    // After a conflict the session stops, so the editor cannot overwrite the disk.
    session.editBody("More of mine\n");
    await session.flush();
    expect((await vault.read("library/notes.md")).text).toContain("Changed elsewhere\n");
  });

  it("keeps both edits when the file changed on other lines", async () => {
    const vault = new MemoryVault({ "library/list.md": "---\ntitle: List\n---\nA\nB\nC\n" }, undefined, () => NOW);
    const events = { onState: vi.fn(), onNote: vi.fn(), onRenamed: vi.fn(), onConflict: vi.fn(), onMerged: vi.fn(), onError: vi.fn() } satisfies SessionEvents;
    const loaded = await vault.read("library/list.md");
    const session = new PageSession(vault, "library/list.md", loaded, events, 10_000);
    await vault.saveBody("library/list.md", "A\nB\nC theirs\n", loaded.hash);
    session.editBody("A mine\nB\nC\n");
    await session.flush();
    expect(events.onConflict).not.toHaveBeenCalled();
    expect(events.onMerged).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining("A mine\nB\nC theirs\n") }), null);
    expect(session.busy).toBe(false);
  });

  it("brings the merge into typing done while the save was on its way", async () => {
    const vault = new MemoryVault({ "library/list.md": "---\ntitle: List\n---\nA\nB\nC\n" }, undefined, () => NOW);
    const events = { onState: vi.fn(), onNote: vi.fn(), onRenamed: vi.fn(), onConflict: vi.fn(), onMerged: vi.fn(), onError: vi.fn() } satisfies SessionEvents;
    const loaded = await vault.read("library/list.md");
    const session = new PageSession(vault, "library/list.md", loaded, events, 10_000);
    await vault.saveBody("library/list.md", "A\nB\nC theirs\n", loaded.hash);
    const save = vault.saveBody.bind(vault);
    vi.spyOn(vault, "saveBody").mockImplementationOnce(async (...args) => {
      session.editBody("A mine, more\nB\nC\n");
      return save(...args);
    });
    session.editBody("A mine\nB\nC\n");
    await session.flush();
    expect(events.onMerged).toHaveBeenCalledWith(expect.anything(), "A mine, more\nB\nC theirs\n");
  });

  it("adopts outside changes to the frontmatter so the next save builds on them", async () => {
    const { vault, events, open } = setup();
    const session = await open();
    const tagged = await vault.setTags("library/notes.md", ["idea"], []);
    expect(session.adopt(tagged)).toBe(true);
    session.editBody("Second line\n");
    await session.flush();
    expect(events.onConflict).not.toHaveBeenCalled();
    const text = (await vault.read("library/notes.md")).text;
    expect(text).toContain("tags: [idea]");
    expect(text).toContain("Second line");
    // A different body is not adopted: the page must reload.
    const other = await vault.saveBody("library/notes.md", "Changed elsewhere\n", (await vault.read("library/notes.md")).hash);
    expect(session.adopt(other.note)).toBe(false);
  });

  it("reports failures and keeps going", async () => {
    const { vault, events, open } = setup();
    const session = await open();
    const spy = vi.spyOn(vault, "saveBody").mockRejectedValueOnce(new Error("disk full"));
    session.editBody("Draft\n");
    await session.flush();
    expect(events.onError).toHaveBeenCalledWith("disk full");
    expect(events.onState).toHaveBeenLastCalledWith("failed");
    spy.mockRestore();
    session.editBody("Draft again\n");
    await session.flush();
    expect((await vault.read("library/notes.md")).text).toContain("Draft again\n");
  });
});
