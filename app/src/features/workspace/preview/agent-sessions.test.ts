// The preview's agent sessions: what the chat's stand-in writes is listed as
// a session in history, and undoing the session reverts it as new versions.

import { describe, expect, it } from "vitest";

import { MemoryVault } from "./memory-vault";

const NOW = Date.UTC(2026, 8, 24, 8, 0, 0);
const CHAT = { session: "chat-s1", client: "chat" };
const card = (title: string) => ({ kind: "card" as const, title, date: "2026-09-24" });

describe("preview agent sessions", () => {
  it("lists an agent's card as its session's changes in history", async () => {
    const clock = { now: NOW };
    const v = new MemoryVault({}, undefined, () => clock.now);
    await v.create(card("Mine"));
    clock.now += 60_000;
    const made = await v.agentCreate(CHAT, card("Hotel ideas"), "Three near the station.\n");
    expect(made.meta.path).toBe("inbox/hotel-ideas.md");
    expect(made.text).toContain("\nThree near the station.\n");

    const history = await v.history(null);
    expect(history.map((c) => [c.summary, c.author, c.session, c.agent])).toEqual([
      ["edit: Hotel ideas", "agent:chat", "chat-s1", true],
      ["create: Hotel ideas", "agent:chat", "chat-s1", true],
      ["create: Mine", "You", null, false],
    ]);
    expect(await v.sessions()).toEqual([{ id: "chat-s1", client: "chat", started: NOW + 60_000, last: NOW + 60_000, commits: 2, undone: false }]);
  });

  it("undoes a session newest first, the card going to the trash", async () => {
    const v = new MemoryVault({}, undefined, () => NOW);
    const made = await v.agentCreate(CHAT, card("Hotel ideas"), "Three near the station.\n");
    const undone = await v.undoSession("chat-s1");
    expect(undone.conflict).toBeNull();
    expect(undone.reverted).toHaveLength(2);
    expect((await v.list()).map((n) => n.path)).not.toContain(made.meta.path);
    expect((await v.listTrash()).map((t) => t.original)).toEqual([made.meta.path]);
    const history = await v.history(null);
    expect(history.filter((c) => c.undoes).map((c) => c.summary)).toEqual(["undo: create: Hotel ideas", "undo: edit: Hotel ideas"]);
    expect((await v.sessions())[0]!.undone).toBe(true);
    expect(await v.undoSession("chat-s1")).toEqual({ reverted: [], conflict: null });
  });

  it("stops at a note edited after the session, keeping the edit", async () => {
    const clock = { now: NOW };
    const v = new MemoryVault({}, undefined, () => clock.now);
    const made = await v.agentCreate(CHAT, card("Hotel ideas"), "Three near the station.\n");
    clock.now += 5_000;
    await v.saveBody(made.meta.path, "Three near the station.\nAnd one by the river.\n", made.hash);
    // A person's edit right after the agent's is a version of its own.
    expect((await v.history(made.meta.path)).map((c) => c.author)).toEqual(["You", "agent:chat", "agent:chat"]);
    const undone = await v.undoSession("chat-s1");
    expect(undone.reverted).toEqual([]);
    expect(undone.conflict).toMatchObject({ path: made.meta.path, summary: "edit: Hotel ideas" });
    expect((await v.read(made.meta.path)).text).toContain("And one by the river.");
  });

  it("keeps a saved chat in chats/ as a chat note", async () => {
    const v = new MemoryVault({}, undefined, () => NOW);
    const saved = await v.saveChat("Trip: what to pack?", "## You\n\nWhat to pack?\n");
    expect(saved.meta.path).toBe("chats/2026-09-24-trip-what-to-pack.md");
    expect(saved.meta.kind).toBe("chat");
    expect(saved.meta.title).toBe("Trip: what to pack?");
    expect(saved.text).toMatch(/^---\nid: \w{26}\ntitle: "Trip: what to pack\?"\ntype: chat\ncreated: 2026-09-24T08:00:00Z\n/);
    expect(saved.text.endsWith("---\n## You\n\nWhat to pack?\n")).toBe(true);
    expect((await v.saveChat("Trip: what to pack?", "Again")).meta.path).toBe("chats/2026-09-24-trip-what-to-pack-2.md");
  });
});
