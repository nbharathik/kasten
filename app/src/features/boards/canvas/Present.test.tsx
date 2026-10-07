// Presenting a board: its sections as slides in reading order,
// moved through with the keys and the controls, from a chosen section, and
// the view fitted to each one.

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MemoryVault } from "../../workspace/preview/memory-vault";
import { derive } from "../../workspace/store-layout";
import { useWorkspace } from "../../workspace/store";
import { initialLayout } from "../../workspace/tabs";
import { boardFilesChanged } from "../events";
import { useBoards } from "../store";
import { BoardCanvas } from "./BoardCanvas";
import { fitRect } from "./model/slides";
import { mockReactFlow } from "./test/flow-mocks";
import { forgetTrails } from "./trail";

const TALK = "library/talk.canvas";
const PLAIN = "library/plain.canvas";
const section = (id: string, label: string, x: number, y: number) => ({ id, type: "group", label, x, y, width: 600, height: 400 });
const SEED = {
  // Drawn out of order: the talk reads Why, How, Next.
  [TALK]: JSON.stringify({
    nodes: [section("c", "Next", 0, 600), section("b", "How", 800, 10), section("a", "Why", 0, 0), { id: "s1", type: "text", text: "Point", x: 900, y: 120, width: 200, height: 100 }],
    edges: [],
    "x-kasten": { title: "Talk" },
  }),
  [PLAIN]: JSON.stringify({ nodes: [{ id: "s1", type: "text", text: "Alone", x: 0, y: 0, width: 200, height: 100 }], edges: [], "x-kasten": { title: "Plain" } }),
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

async function open(path = TALK, count = 4) {
  const view = render(<BoardCanvas path={path} />);
  const board = await view.findByLabelText(/^Whiteboard:/);
  await waitFor(() => expect(view.container.querySelectorAll(".react-flow__node")).toHaveLength(count));
  return { view, board };
}

const where = () => within(screen.getByRole("toolbar", { name: "Presentation" })).getByText(/\d+ \/ \d+/).textContent;
const key = (board: HTMLElement, name: string, init: Record<string, unknown> = {}) => act(async () => fireEvent.keyDown(board, { key: name, ...init }));

describe("presenting a board", () => {
  it("shows the sections in reading order, moved through with the keys, until Esc", async () => {
    const { board } = await open();
    await key(board, "p");
    expect(board.className).toContain("is-presenting");
    expect(screen.queryByRole("toolbar", { name: "Tools" })).toBeNull();
    expect(where()).toBe("1 / 3");
    expect(screen.getByText("Why", { selector: ".kasten-present-label" })).toBeTruthy();
    await key(board, "ArrowRight");
    expect(where()).toBe("2 / 3");
    await key(board, " ");
    expect(where()).toBe("3 / 3");
    expect(screen.getByText("Next", { selector: ".kasten-present-label" })).toBeTruthy();
    // Past the end stays at the end; Home goes back to the start.
    await key(board, "PageDown");
    expect(where()).toBe("3 / 3");
    await key(board, " ", { shiftKey: true });
    expect(where()).toBe("2 / 3");
    await key(board, "Home");
    expect(where()).toBe("1 / 3");
    // The board's own keys wait: D does not pick the pen.
    await key(board, "d");
    expect(board.className).toContain("is-tool-select");
    await key(board, "Escape");
    expect(board.className).not.toContain("is-presenting");
    expect(screen.getByRole("toolbar", { name: "Tools" })).toBeTruthy();
  });

  it("moves with the controls and a click on the slide, and ends from them", async () => {
    const { board } = await open();
    fireEvent.click(screen.getByRole("button", { name: "Present" }));
    await waitFor(() => expect(where()).toBe("1 / 3"));
    const bar = screen.getByRole("toolbar", { name: "Presentation" });
    expect((within(bar).getByRole("button", { name: "Previous slide" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(bar).getByRole("button", { name: "Next slide" }));
    expect(where()).toBe("2 / 3");
    // Space on a control presses it; it does not also go on a slide.
    await act(async () => fireEvent.keyDown(within(bar).getByRole("button", { name: "Next slide" }), { key: " " }));
    expect(where()).toBe("2 / 3");
    fireEvent.click(board.querySelector(".react-flow__pane")!);
    expect(where()).toBe("3 / 3");
    fireEvent.click(within(bar).getByRole("button", { name: "End the presentation" }));
    expect(board.className).not.toContain("is-presenting");
  });

  it("stays within the slides when the board changes under the talk", async () => {
    const { board } = await open();
    await key(board, "p");
    await key(board, "End");
    expect(where()).toBe("3 / 3");
    // Another window takes the last section off.
    await act(async () => {
      await vault.boardApply(TALK, [{ kind: "remove", ids: ["c"] }]);
      boardFilesChanged([TALK]);
    });
    await waitFor(() => expect(where()).toBe("2 / 2"), { timeout: 3000 });
  });

  it("starts from the section chosen in its menu", async () => {
    const { view } = await open();
    fireEvent.contextMenu(view.container.querySelector('.react-flow__node[data-id="b"]')!);
    fireEvent.click(await screen.findByRole("menuitem", { name: /Present from here/ }));
    await waitFor(() => expect(where()).toBe("2 / 3"));
  });

  it("fits each slide to the screen", async () => {
    const { view, board } = await open();
    await key(board, "p");
    await key(board, "ArrowRight");
    // The mocks give the board 1200 × 800; "How" is the second slide.
    const view2 = fitRect({ x: 800, y: 10, width: 600, height: 400 }, 1200, 800, 0.08);
    const expected = `translate(${view2.x}px,${view2.y}px) scale(${view2.zoom})`;
    await waitFor(() => expect(view.container.querySelector<HTMLElement>(".react-flow__viewport")!.style.transform).toBe(expected), { timeout: 3000 });
  });

  it("gives back the view from before, by Esc or the controls", async () => {
    const { view, board } = await open();
    const transform = () => view.container.querySelector<HTMLElement>(".react-flow__viewport")!.style.transform;
    const before = transform();
    await key(board, "p");
    await key(board, "ArrowRight");
    await waitFor(() => expect(transform()).not.toBe(before), { timeout: 3000 });
    await key(board, "Escape");
    await waitFor(() => expect(transform()).toBe(before), { timeout: 3000 });

    await key(board, "p");
    await waitFor(() => expect(transform()).not.toBe(before), { timeout: 3000 });
    fireEvent.click(within(screen.getByRole("toolbar", { name: "Presentation" })).getByRole("button", { name: "End the presentation" }));
    await waitFor(() => expect(transform()).toBe(before), { timeout: 3000 });
  });

  it("says how to make slides when the board has no sections", async () => {
    const { board } = await open(PLAIN, 1);
    await key(board, "p");
    expect(board.className).not.toContain("is-presenting");
    expect(useWorkspace.getState().toasts.map((t) => t.text).join(" ")).toMatch(/Sections are the slides/);
  });
});
