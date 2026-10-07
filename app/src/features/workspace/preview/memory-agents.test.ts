// The preview's brainstorm behaves like kasten-core's (tests/brainstorm.rs):
// cards in the board's project, a section below what was there, all in one
// session that History lists and one undo takes back, board included.

import { describe, expect, it } from "vitest";

import type { BoardNode } from "../../../lib/vault/types";
import { MemoryVault } from "./memory-vault";

const NOW = Date.UTC(2026, 8, 24, 8, 0, 0);
const BOARD = "projects/trip/boards/hilltown.canvas";
const CANVAS = JSON.stringify({ nodes: [{ id: "a", type: "text", text: "Book the guesthouse", x: 100, y: 0, width: 260, height: 120 }], edges: [], "x-kasten": { title: "Hilltown" } });
const AGENT = { session: "brainstorm-s1", client: "kasten-brainstorm" };
const DAY = "2026-09-24";

const ideas = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `Idea ${i + 1}`, text: `Why idea ${i + 1} might work.` }));
const inside = (outer: BoardNode) => (n: BoardNode) => n.x >= outer.x && n.y >= outer.y && n.x + n.width <= outer.x + outer.width && n.y + n.height <= outer.y + outer.height;

function vault() {
  const clock = { now: NOW };
  return { v: new MemoryVault({ [BOARD]: CANVAS }, undefined, () => clock.now), clock };
}

describe("preview brainstorm", () => {
  it("places ideas as cards in a new section below the board, as one session", async () => {
    const { v } = vault();
    const done = await v.brainstorm(AGENT, BOARD, "Day trips", ideas(5), DAY);
    expect(done.session).toBe("brainstorm-s1");
    expect(done.cards).toHaveLength(5);
    expect(done.cards.every((p) => p.startsWith("projects/trip/cards/"))).toBe(true);
    expect((await v.read(done.cards[0]!)).text).toContain("\nWhy idea 1 might work.\n");

    const board = await v.board(BOARD);
    expect(board.nodes).toHaveLength(7);
    const section = board.nodes.find((n) => n.id === done.section)!;
    // The core's gap below the lowest node, in line with the leftmost one.
    expect(section).toMatchObject({ kind: "group", label: "Day trips", x: 100, y: 200 });
    const cards = board.nodes.filter((n) => done.cards.includes(n.file ?? ""));
    expect(cards).toHaveLength(5);
    expect(cards.every(inside(section))).toBe(true);

    expect(await v.sessions()).toEqual([{ id: "brainstorm-s1", client: "kasten-brainstorm", started: NOW, last: NOW, commits: 12, undone: false }]);
    const history = (await v.history(null)).filter((c) => c.session === "brainstorm-s1");
    expect(history.slice(0, 2).map((c) => [c.summary, c.author])).toEqual([
      ["board: section Day trips on Hilltown", "agent:kasten-brainstorm"],
      ["board: add 5 cards on Hilltown", "agent:kasten-brainstorm"],
    ]);
    // History shows what the placing changed on the board.
    const [change] = await v.commitChanges(history[1]!.id);
    expect(change!.path).toBe(BOARD);
    expect(change!.before).toBe(CANVAS);
    expect(change!.after).toContain(`"file":"${done.cards[0]}"`);
  });

  it("undoes the session whole: the board as it was, the cards in the trash", async () => {
    const { v } = vault();
    const done = await v.brainstorm(AGENT, BOARD, "", ideas(3), DAY);
    expect((await v.board(BOARD)).nodes.find((n) => n.id === done.section)!.label).toBe("Brainstorm");
    const undone = await v.undoSession("brainstorm-s1");
    expect(undone.conflict).toBeNull();
    expect(undone.reverted).toHaveLength(8);
    expect((await v.board(BOARD)).nodes.map((n) => n.id)).toEqual(["a"]);
    expect((await v.list()).map((n) => n.path)).toEqual([]);
    expect((await v.listTrash()).map((t) => t.original).sort()).toEqual([...done.cards].sort());
    expect((await v.sessions())[0]!.undone).toBe(true);
    // The undo's own changes read back too.
    const undo = (await v.history(null)).find((c) => c.summary === "undo: board: section Brainstorm on Hilltown")!;
    const [change] = await v.commitChanges(undo.id);
    expect(change!.after).not.toContain(done.section);
    expect(change!.before).toContain(done.section);
  });

  it("stops at a board changed after the session, keeping the change", async () => {
    const { v, clock } = vault();
    const done = await v.brainstorm(AGENT, BOARD, "Day trips", ideas(2), DAY);
    clock.now += 5_000;
    await v.boardApply(BOARD, [{ kind: "place", id: "a", x: 500, y: 40 }]);
    const undone = await v.undoSession("brainstorm-s1");
    expect(undone.reverted).toEqual([]);
    expect(undone.conflict).toMatchObject({ path: BOARD, summary: "board: section Day trips on Hilltown" });
    const board = await v.board(BOARD);
    expect(board.nodes.find((n) => n.id === "a")).toMatchObject({ x: 500, y: 40 });
    expect(board.nodes.some((n) => n.id === done.section)).toBe(true);
  });

  it("refuses no ideas, too many, or no such board, and skips blank titles", async () => {
    const { v } = vault();
    await expect(v.brainstorm(AGENT, BOARD, "x", [], DAY)).rejects.toThrow("at least one idea");
    await expect(v.brainstorm(AGENT, BOARD, "x", ideas(21), DAY)).rejects.toThrow("at most 20");
    await expect(v.brainstorm(AGENT, "library/nowhere.canvas", "x", ideas(2), DAY)).rejects.toThrow("No board");
    expect(await v.list()).toEqual([]);
    const done = await v.brainstorm(AGENT, BOARD, "x", [{ title: "  ", text: "No title" }, { title: "A real one", text: "" }], DAY);
    expect(done.cards).toEqual(["projects/trip/cards/a-real-one.md"]);
  });
});
