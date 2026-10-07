// Copy, cut, paste and duplicate on a board: copies get new ids, keep the
// lines between them, undo in one step, and a note's card goes on a board
// only once.

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MemoryVault } from "../../workspace/preview/memory-vault";
import { derive } from "../../workspace/store-layout";
import { useWorkspace } from "../../workspace/store";
import { initialLayout } from "../../workspace/tabs";
import { useBoards } from "../store";
import { BoardCanvas } from "./BoardCanvas";
import { mockReactFlow } from "./test/flow-mocks";
import { forgetTrails } from "./trail";

const MAIN = "library/main.canvas";
const OTHER = "library/other.canvas";
const SEED = {
  "library/idea.md": "---\ntitle: Idea\n---\nAn idea\n",
  [MAIN]: JSON.stringify({
    nodes: [
      { id: "s1", type: "text", text: "A sticky", x: 0, y: 0, width: 260, height: 120 },
      { id: "c1", type: "file", file: "library/idea.md", x: 400, y: 0, width: 320, height: 180 },
    ],
    edges: [{ id: "e1", fromNode: "s1", toNode: "c1" }],
    "x-kasten": { title: "Main" },
  }),
  [OTHER]: JSON.stringify({ nodes: [], edges: [], "x-kasten": { title: "Other" } }),
};

let vault: MemoryVault;

beforeAll(mockReactFlow);
beforeEach(async () => {
  localStorage.clear();
  forgetTrails();
  vault = new MemoryVault(SEED);
  useWorkspace.setState({ client: vault, ready: true, notes: await vault.list(), ...derive(initialLayout()), stack: [], stackOpen: false, recent: [], toasts: [] });
  await useBoards.getState().load();
});
afterEach(cleanup);

async function open(path: string, count: number) {
  const view = render(<BoardCanvas path={path} />);
  const board = await view.findByLabelText(/^Whiteboard:/);
  await waitFor(() => expect(view.container.querySelectorAll(".react-flow__node")).toHaveLength(count));
  return { view, board };
}

const onBoard = async (path: string) => vault.board(path);
const key = (board: HTMLElement, k: string) => act(async () => fireEvent.keyDown(board, { key: k, ctrlKey: true }));

describe("the board's clipboard", () => {
  it("duplicates the selection beside itself, but not a note's card, and undoes it in one step", async () => {
    const { board } = await open(MAIN, 2);
    await key(board, "a");
    await key(board, "d");
    await waitFor(async () => expect((await onBoard(MAIN)).nodes).toHaveLength(3));
    const copy = (await onBoard(MAIN)).nodes.find((n) => n.kind === "text" && n.id !== "s1")!;
    expect(copy).toMatchObject({ text: "A sticky", x: 24, y: 24 });
    expect(useWorkspace.getState().toasts.at(-1)?.text).toBe("Pasted 1; 1 card is on this board already");
    await key(board, "z");
    await waitFor(async () => expect((await onBoard(MAIN)).nodes.map((n) => n.id).sort()).toEqual(["c1", "s1"]));
  });

  it("copies onto another board with the lines between the copied things", async () => {
    const first = await open(MAIN, 2);
    await key(first.board, "a");
    await key(first.board, "c");
    cleanup();
    const second = await open(OTHER, 0);
    await key(second.board, "v");
    await waitFor(async () => expect((await onBoard(OTHER)).nodes).toHaveLength(2));
    const pasted = await onBoard(OTHER);
    expect(pasted.nodes.map((n) => n.kind).sort()).toEqual(["file", "text"]);
    expect(pasted.nodes.every((n) => n.id !== "s1" && n.id !== "c1")).toBe(true);
    expect(pasted.edges).toHaveLength(1);
    expect(new Set([pasted.edges[0]!.from, pasted.edges[0]!.to])).toEqual(new Set(pasted.nodes.map((n) => n.id)));
  });

  it("cuts the selection off the board, and the note stays", async () => {
    const { board } = await open(MAIN, 2);
    await key(board, "a");
    await key(board, "x");
    await waitFor(async () => expect((await onBoard(MAIN)).nodes).toHaveLength(0));
    expect((await vault.list()).some((n) => n.path === "library/idea.md")).toBe(true);
  });
});

describe("find on a board", () => {
  it("lists what is on the board by its words and selects the pick", async () => {
    const { view, board } = await open(MAIN, 2);
    await key(board, "f");
    const finder = screen.getByRole("dialog", { name: "Find on this board" });
    expect(within(finder).getAllByRole("option").map((o) => o.textContent)).toEqual([expect.stringContaining("A sticky"), expect.stringContaining("Idea")]);
    fireEvent.change(within(finder).getByRole("textbox"), { target: { value: "idea" } });
    await act(async () => fireEvent.click(within(finder).getByRole("option", { name: /Idea/ })));
    expect(screen.queryByRole("dialog", { name: "Find on this board" })).toBeNull();
    await waitFor(() => expect(view.container.querySelector('.react-flow__node[data-id="c1"]')?.classList.contains("selected")).toBe(true));
  });
});
