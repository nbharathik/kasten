import { describe, expect, it, vi } from "vitest";

import type { BoardApplied, BoardChange } from "../../../../lib/vault/types";
import { MemoryVault } from "../../../workspace/preview/memory-vault";
import { BoardHistory } from "./history";
import { BoardQueue, Dropped } from "./queue";

const BOARD = "library/plan.canvas";

function vault() {
  return new MemoryVault({
    "library/idea.md": "---\ntitle: Idea\n---\nAn idea.\n",
    [BOARD]: JSON.stringify({
      nodes: [
        { id: "a", type: "text", text: "A", x: 0, y: 0, width: 260, height: 120 },
        { id: "b", type: "text", text: "B", x: 400, y: 0, width: 260, height: 120 },
        { id: "c", type: "file", file: "library/idea.md", x: 0, y: 300, width: 320, height: 180 },
      ],
      edges: [{ id: "e", fromNode: "a", fromSide: "right", toNode: "b", toSide: "left" }],
      "x-kasten": { cardSize: { c: "expanded" } },
    }),
  });
}

async function setup(client = vault()) {
  const shown = vi.fn();
  const queue = new BoardQueue(client, BOARD, await client.board(BOARD), shown);
  return { client, queue, shown, history: new BoardHistory(queue) };
}

const node = (queue: BoardQueue, id: string) => queue.doc.nodes.find((n) => n.id === id);

describe("reading a board again", () => {
  it("drops a read that started before batches were sent and finished after them", async () => {
    const client = vault();
    const read = client.board.bind(client);
    let release: () => void = () => {};
    const { queue } = await setup(client);
    // The refresh's read sees the board as it was, and answers late.
    let first = true;
    client.board = async (path: string) => {
      if (!first) return read(path);
      first = false;
      const stale = await read(path);
      await new Promise<void>((r) => (release = r));
      return stale;
    };
    const refreshed = queue.refresh();
    await queue.send([{ kind: "sticky", text: "New", x: 0, y: 600 }]);
    release();
    expect(await refreshed).toBe(false);
    expect(queue.doc.nodes.some((n) => n.kind === "text" && n.text === "New")).toBe(true);
  });
});

describe("saving a board batch by batch", () => {
  it("shows a batch at once and then the core's board", async () => {
    const { queue, shown, client } = await setup();
    const sent = queue.send([{ kind: "place", id: "a", x: 10, y: 20 }]);
    expect(node(queue, "a")).toMatchObject({ x: 10, y: 20 });
    expect(queue.busy).toBe(true);
    expect(shown).toHaveBeenCalledTimes(1);
    await sent;
    expect(queue.busy).toBe(false);
    expect((await client.board(BOARD)).nodes.find((n) => n.id === "a")).toMatchObject({ x: 10, y: 20 });
    // The core agreed with what was shown: nothing is drawn again.
    expect(shown).toHaveBeenCalledTimes(1);
  });

  it("sends batches one at a time, in the order they were made", async () => {
    const client = vault();
    const order: string[] = [];
    const apply = client.boardApply.bind(client);
    client.boardApply = async (board: string, changes: BoardChange[]): Promise<BoardApplied> => {
      order.push(`start ${changes.length}`);
      await new Promise((r) => setTimeout(r, 5));
      order.push(`end ${changes.length}`);
      return apply(board, changes);
    };
    const { queue } = await setup(client);
    const first = queue.send([{ kind: "place", id: "a", x: 1, y: 1 }]);
    const second = queue.send([{ kind: "place", id: "a", x: 2, y: 2 }, { kind: "place", id: "b", x: 2, y: 2 }]);
    expect(node(queue, "a")).toMatchObject({ x: 2, y: 2 });
    await Promise.all([first, second]);
    expect(order).toEqual(["start 1", "end 1", "start 2", "end 2"]);
    expect(node(queue, "a")).toMatchObject({ x: 2, y: 2 });
  });

  it("drops what was queued behind a refused batch and reads the board again", async () => {
    const { queue } = await setup();
    const good = queue.send([{ kind: "place", id: "a", x: 5, y: 5 }]);
    const bad = queue.send([{ kind: "place", id: "nope", x: 1, y: 1 }, { kind: "place", id: "b", x: 99, y: 99 }]);
    const behind = queue.send([{ kind: "place", id: "a", x: 50, y: 50 }]);
    await good;
    await expect(bad).rejects.toThrow(/nope/);
    await expect(behind).rejects.toBeInstanceOf(Dropped);
    expect(node(queue, "a")).toMatchObject({ x: 5, y: 5 });
    expect(node(queue, "b")).toMatchObject({ x: 400, y: 0 });
    // Later batches go through again.
    await queue.send([{ kind: "place", id: "b", x: 7, y: 7 }]);
    expect(node(queue, "b")).toMatchObject({ x: 7, y: 7 });
  });

  it("takes a board changed on disk only when idle and different", async () => {
    const { queue, client, shown } = await setup();
    const before = queue.doc;
    expect(await queue.refresh()).toBe(false);
    expect(queue.doc).toBe(before);
    const sending = queue.send([{ kind: "place", id: "a", x: 3, y: 3 }]);
    expect(await queue.refresh()).toBe(false);
    await sending;
    await client.addSticky(BOARD, "From an agent", [900, 900]);
    shown.mockClear();
    expect(await queue.refresh()).toBe(true);
    expect(queue.doc.nodes.some((n) => n.text === "From an agent")).toBe(true);
    expect(queue.doc.nodes.find((n) => n.id === "b")).toBe(before.nodes.find((n) => n.id === "b"));
    expect(shown).toHaveBeenCalledTimes(1);
  });
});

describe("undo and redo on a board", () => {
  it("undoes and redoes a move", async () => {
    const { queue, history } = await setup();
    await history.commit([{ kind: "place", id: "a", x: 100, y: 100 }]);
    expect(history.canUndo).toBe(true);
    await history.undo();
    expect(node(queue, "a")).toMatchObject({ x: 0, y: 0 });
    expect(history.canRedo).toBe(true);
    await history.redo();
    expect(node(queue, "a")).toMatchObject({ x: 100, y: 100 });
  });

  it("brings removed nodes back with their edges and card sizes", async () => {
    const { queue, history, client } = await setup();
    await history.commit([{ kind: "remove", ids: ["a", "c"] }]);
    expect(queue.doc.edges).toEqual([]);
    await history.undo();
    expect(node(queue, "a")).toMatchObject({ text: "A" });
    expect(node(queue, "c")).toMatchObject({ size: "expanded", title: "Idea" });
    expect(queue.doc.edges.map((e) => e.id)).toEqual(["e"]);
    expect((await client.list()).some((n) => n.path === "library/idea.md")).toBe(true);
  });

  it("takes away what was made, and puts it back with the same id", async () => {
    const { queue, history } = await setup();
    const { made } = await history.commit([{ kind: "sticky", text: "New", x: 0, y: 600 }]);
    await history.undo();
    expect(node(queue, made[0]!)).toBeUndefined();
    await history.redo();
    expect(node(queue, made[0]!)).toMatchObject({ text: "New" });
  });

  it("undoes grouped batches as one, and a new edit clears redo", async () => {
    const { queue, history } = await setup();
    const { made } = await history.commit([{ kind: "sticky", text: "S", x: 0, y: 600 }], { group: "new" });
    await history.commit([{ kind: "place", id: made[0]!, x: 0, y: 700, width: 400, height: 300 }], { group: "new" });
    await history.undo();
    expect(node(queue, made[0]!)).toBeUndefined();
    expect(history.canUndo).toBe(false);
    await history.commit([{ kind: "place", id: "b", x: 1, y: 1 }]);
    expect(history.canRedo).toBe(false);
  });

  it("joins nudges only within the time given", async () => {
    let now = 0;
    const client = vault();
    const queue = new BoardQueue(client, BOARD, await client.board(BOARD), () => {});
    const history = new BoardHistory(queue, () => {}, () => now);
    await history.commit([{ kind: "place", id: "a", x: 1, y: 0 }], { group: "nudge:a", within: 800 });
    now = 500;
    await history.commit([{ kind: "place", id: "a", x: 2, y: 0 }], { group: "nudge:a", within: 800 });
    now = 5000;
    await history.commit([{ kind: "place", id: "a", x: 3, y: 0 }], { group: "nudge:a", within: 800 });
    await history.undo();
    expect(node(queue, "a")).toMatchObject({ x: 2 });
    await history.undo();
    expect(node(queue, "a")).toMatchObject({ x: 0 });
  });
});
