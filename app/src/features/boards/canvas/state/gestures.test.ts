import { describe, expect, it, vi } from "vitest";

import { isoDay } from "../../../../lib/dates";
import { MemoryVault } from "../../../workspace/preview/memory-vault";
import { BoardController, type BoardDeps } from "./controller";
import { EXPANDED, layout, nudge, removeSelection, setCardSize, setText } from "./gestures";
import { addLink, addNotes, newCard, projectOf } from "./making";
import { select } from "./store";

const BOARD = "projects/demo/boards/plan.canvas";

async function setup(path = BOARD) {
  const vault = new MemoryVault({
    "projects/demo/_project.md": "---\ntitle: Demo\ntype: project\n---\n",
    "projects/demo/cards/a.md": "---\ntitle: A\ntags: [paper]\n---\nA.\n",
    "library/b.md": "---\ntitle: B\n---\nB.\n",
    [path]: JSON.stringify({
      nodes: [
        { id: "s", type: "group", label: "S", x: -40, y: -80, width: 800, height: 400 },
        { id: "c", type: "file", file: "projects/demo/cards/a.md", x: 0, y: 0, width: 320, height: 180 },
        { id: "t", type: "text", text: "T", x: 400, y: 0, width: 260, height: 120 },
        { id: "l", type: "link", url: "https://example.com", x: 2000, y: 0, width: 320, height: 180 },
      ],
      edges: [{ id: "e", fromNode: "c", toNode: "t" }],
    }),
  });
  const toast = vi.fn();
  const deps: BoardDeps = {
    client: vault,
    notes: () => notes,
    toast,
    open: vi.fn(),
    create: async (draft) => {
      const note = await vault.create({ date: isoDay(new Date()), ...draft });
      notes = await vault.list();
      return note;
    },
    trash: async (p) => void (await vault.trash(p)),
    enter: vi.fn(),
  };
  let notes = await vault.list();
  const board = new BoardController(path, await vault.board(path), deps);
  const node = (id: string) => board.doc.nodes.find((n) => n.id === id);
  return { vault, board, node, toast, deps };
}

describe("board gestures", () => {
  it("enlarges a card to write in when expanding, and shrinks it back", async () => {
    const { board, node } = await setup();
    setCardSize(board, ["c"], "expanded");
    await board.queue.idle();
    expect(node("c")).toMatchObject({ size: "expanded", ...EXPANDED });
    setCardSize(board, ["c"], null);
    await board.queue.idle();
    expect(node("c")).toMatchObject({ width: 320, height: 180 });
    expect(node("c")!.size).toBeUndefined();
  });

  it("nudges what a section holds with it, key repeats undoing as one", async () => {
    const { board, node } = await setup();
    select(board.store, ["s"]);
    nudge(board, 10, 0);
    await board.queue.idle();
    nudge(board, 10, 0);
    await board.queue.idle();
    expect(node("s")!.x).toBe(-20);
    expect(node("c")!.x).toBe(20);
    expect(node("t")!.x).toBe(420);
    expect(node("l")!.x).toBe(2000);
    await board.undo();
    expect(node("s")!.x).toBe(-40);
    expect(node("c")!.x).toBe(0);
  });

  it("takes selected nodes and edges off in one batch", async () => {
    const { board, vault } = await setup();
    select(board.store, ["t"], ["e"]);
    removeSelection(board);
    await board.queue.idle();
    const disk = await vault.board(BOARD);
    expect(disk.nodes.map((n) => n.id)).toEqual(["s", "c", "l"]);
    expect(disk.edges).toEqual([]);
  });

  it("reads a typed address as a web address", async () => {
    const { board, node } = await setup();
    setText(board, "l", "kasten.app/docs");
    await board.queue.idle();
    expect(node("l")!.url).toBe("https://kasten.app/docs");
    const id = await addLink(board, "example.org", { x: 0, y: 900 });
    expect(node(id!)!.url).toBe("https://example.org");
  });

  it("shows a refused change and reads the board again", async () => {
    const { board, toast, vault } = await setup();
    await vault.boardApply(BOARD, [{ kind: "remove", ids: ["t"] }]);
    await board.commit([{ kind: "text", id: "t", text: "Gone meanwhile" }]);
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/No node t/));
    expect(board.doc.nodes.some((n) => n.id === "t")).toBe(false);
    expect(board.history.canUndo).toBe(false);
  });

  it("says when a layout has nothing to work on", async () => {
    const { board, toast } = await setup();
    select(board.store, ["t"]);
    layout(board, "cluster");
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/cards/));
  });
});

describe("making things on a board", () => {
  it("files a new card in the board's project, else in the inbox", async () => {
    expect(projectOf(BOARD)).toBe("demo");
    expect(projectOf("library/x.canvas")).toBeNull();
    const { board, node } = await setup();
    const id = await newCard(board, { x: 100, y: 700 });
    expect(node(id!)).toMatchObject({ size: "expanded", x: 100, y: 700 });
    expect(node(id!)!.file).toMatch(/^projects\/demo\/cards\//);
    expect(board.store.getState().focusCard).toEqual({ id, at: "title" });
    // Undoing the new card takes it off in one step; the note stays.
    await board.undo();
    expect(node(id!)).toBeUndefined();
    const loose = await setup("library/loose.canvas");
    const other = await newCard(loose.board, { x: 0, y: 0 });
    expect(loose.node(other!)!.file).toMatch(/^inbox\//);
  });

  it("adds known notes and boards, not unknown paths or the board itself", async () => {
    const { board } = await setup();
    const ids = await addNotes(board, ["library/b.md", "library/nope.md", BOARD, "library/b.md"], { x: 0, y: 1000 });
    expect(ids).toHaveLength(1);
    expect(board.doc.nodes.filter((n) => n.file === "library/b.md")).toHaveLength(1);
    expect(board.store.getState().nodes.filter((n) => n.selected).map((n) => n.id)).toEqual(ids);
  });
});
