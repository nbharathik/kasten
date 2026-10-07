import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { type DeckOptions, idsOf, openDeck } from "../filmstrip/test-support.ts";
import { GridView } from "./GridView.tsx";
import { PITCH_X, geometryOf } from "./layout.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const GRID = geometryOf({ w: 960, h: 540 }, 1200);
/** Where the mocked grid starts on the page. */
const ORIGIN = { x: 100, y: 28 };

/** The page has no layout under jsdom: the scroller and the grid are given places, so a pointer can be put over a tile. */
function place() {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) });
    if (this.classList.contains("ks-grid-view")) return box(0, 0, 1200, 800);
    if (this.classList.contains("ks-gv-grid")) return box(ORIGIN.x, ORIGIN.y, GRID.width, 900);
    return box(0, 0, 0, 0);
  });
}

async function setup(options: DeckOptions = {}) {
  const made = await openDeck(options);
  place();
  const view = render(<GridView session={made.session} ui={made.ui} />);
  return { ...made, ...view, ids: idsOf(made.session) };
}

const tiles = () => screen.getAllByRole("option");
const grid = () => screen.getByRole("listbox", { name: "Slides" });
const shownOf = () => tiles().findIndex((tile) => tile.getAttribute("aria-current") === "true");
const pickedOf = () => tiles().flatMap((tile, i) => (tile.getAttribute("aria-selected") === "true" ? [i] : []));
/** Over the left (or right) half of a tile: 4 across. */
const over = (index: number, half: "left" | "right" = "left") => ({
  x: ORIGIN.x + (index % 4) * PITCH_X + (half === "left" ? 30 : 230),
  y: ORIGIN.y + Math.floor(index / 4) * GRID.pitchY + 30,
});

function drag(from: HTMLElement, path: { x: number; y: number }[], options: { release?: boolean } = {}) {
  const first = path[0]!;
  fireEvent.pointerDown(from, { button: 0, pointerId: 1, clientX: first.x, clientY: first.y });
  for (const step of path.slice(1)) fireEvent.pointerMove(window, { pointerId: 1, clientX: step.x, clientY: step.y });
  const last = path[path.length - 1]!;
  if (options.release !== false) fireEvent.pointerUp(window, { pointerId: 1, clientX: last.x, clientY: last.y });
}

describe("the grid", () => {
  it("has a tile for each slide with its number under it, and marks the shown one", async () => {
    await setup({ slides: 6 });
    expect(tiles()).toHaveLength(6);
    expect(tiles().map((tile) => tile.querySelector(".ks-gv-num")?.textContent)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(shownOf()).toBe(0);
    expect(pickedOf()).toEqual([0]);
    expect(grid().getAttribute("aria-multiselectable")).toBe("true");
  });

  it("draws each slide at 260 pixels wide, in rows of as many as fit", async () => {
    const { container } = await setup({ slides: 6 });
    const thumb = container.querySelector(".ks-thumb") as HTMLElement;
    expect(thumb.style.width).toBe("260px");
    expect(thumb.style.height).toBe("146px");
    const columns = (container.querySelector(".ks-gv-grid") as HTMLElement).style.gridTemplateColumns;
    expect(columns).toBe("repeat(4, 262px)");
  });

  it("follows the session", async () => {
    const { session, ids } = await setup({ slides: 4 });
    act(() => session.goTo(ids[2]!));
    expect(shownOf()).toBe(2);
    act(() => void session.slides.add());
    expect(tiles()).toHaveLength(5);
    expect(grid().getAttribute("aria-activedescendant")).toBe(tiles()[shownOf()]!.id);
  });

  it("marks a slide that is skipped, and a backup slide", async () => {
    await setup({ slides: 4, hidden: [1], backup: [2] });
    expect(tiles()[1]!.classList.contains("is-skipped")).toBe(true);
    expect(tiles()[1]!.querySelector('[title="Skipped when presenting"]')).not.toBeNull();
    expect(tiles()[2]!.textContent).toContain("Backup");
    expect(tiles()[0]!.querySelector(".ks-gv-flag")).toBeNull();
  });

  it("takes the focus when it opens, so the keys work", async () => {
    await setup({ slides: 2 });
    expect(document.activeElement).toBe(grid());
  });

  it("leaves the focus with a text field that has it", async () => {
    const made = await openDeck({ slides: 2 });
    place();
    const field = document.createElement("input");
    document.body.append(field);
    field.focus();
    render(<GridView session={made.session} ui={made.ui} />);
    expect(document.activeElement).toBe(field);
    field.remove();
  });
});

describe("picking slides", () => {
  it("shows a slide on a click, adds with Ctrl or Cmd, and extends with Shift", async () => {
    const { session, ids } = await setup({ slides: 7 });
    fireEvent.click(tiles()[2]!);
    expect(session.state.slideId).toBe(ids[2]);
    expect(pickedOf()).toEqual([2]);
    fireEvent.click(tiles()[5]!, { ctrlKey: true });
    expect(session.state.slideSelection).toEqual([ids[2], ids[5]]);
    expect(session.state.slideId).toBe(ids[5]);
    fireEvent.click(tiles()[2]!, { metaKey: true });
    expect(session.state.slideSelection).toEqual([ids[5]]);
    fireEvent.click(tiles()[1]!);
    fireEvent.click(tiles()[4]!, { shiftKey: true });
    expect(session.state.slideSelection).toEqual(ids.slice(1, 5));
    expect(session.state.slideId).toBe(ids[1]);
    expect(pickedOf()).toEqual([1, 2, 3, 4]);
  });

  it("opens a slide in the editor on a double click", async () => {
    const { session, ui, ids } = await setup({ slides: 4 });
    ui.setView("grid");
    fireEvent.click(tiles()[2]!);
    fireEvent.doubleClick(tiles()[2]!);
    expect(session.state.slideId).toBe(ids[2]);
    expect(ui.state.view).toBe("edit");
  });

  it("opens the shown slide with Enter", async () => {
    const { session, ui, ids } = await setup({ slides: 4 });
    ui.setView("grid");
    fireEvent.click(tiles()[3]!);
    fireEvent.keyDown(grid(), { key: "Enter" });
    expect(session.state.slideId).toBe(ids[3]);
    expect(ui.state.view).toBe("edit");
  });

  it("opens the slide menu on a right click, after picking the slide if it was not picked", async () => {
    const { session, ui, ids } = await setup({ slides: 4 });
    fireEvent.contextMenu(tiles()[2]!, { clientX: 300, clientY: 200 });
    expect(ui.state.contextMenu).toEqual({ kind: "slide", x: 300, y: 200 });
    expect(session.state.slideSelection).toEqual([ids[2]]);
    fireEvent.click(tiles()[0]!);
    fireEvent.click(tiles()[3]!, { shiftKey: true });
    fireEvent.contextMenu(tiles()[1]!, { clientX: 5, clientY: 6 });
    expect(session.state.slideSelection).toEqual(ids.slice(0, 4));
  });
});

describe("the keyboard", () => {
  it("moves the shown slide along a row with Left and Right and along a column with Up and Down", async () => {
    const { session, ids } = await setup({ slides: 10 });
    fireEvent.keyDown(grid(), { key: "ArrowRight" });
    expect(session.state.slideId).toBe(ids[1]);
    fireEvent.keyDown(grid(), { key: "ArrowDown" });
    expect(session.state.slideId).toBe(ids[5]);
    fireEvent.keyDown(grid(), { key: "ArrowDown" });
    expect(session.state.slideId).toBe(ids[9]);
    fireEvent.keyDown(grid(), { key: "ArrowDown" });
    expect(session.state.slideId).toBe(ids[9]);
    fireEvent.keyDown(grid(), { key: "ArrowUp" });
    expect(session.state.slideId).toBe(ids[5]);
    fireEvent.keyDown(grid(), { key: "ArrowLeft" });
    expect(session.state.slideId).toBe(ids[4]);
    fireEvent.keyDown(grid(), { key: "Home" });
    expect(session.state.slideId).toBe(ids[0]);
    fireEvent.keyDown(grid(), { key: "End" });
    expect(session.state.slideId).toBe(ids[9]);
  });

  it("grows the selection with Shift, picks all with Ctrl+A and drops to one with Escape", async () => {
    const { session, ids } = await setup({ slides: 10 });
    fireEvent.keyDown(grid(), { key: "ArrowRight", shiftKey: true });
    fireEvent.keyDown(grid(), { key: "ArrowRight", shiftKey: true });
    expect(session.state.slideSelection).toEqual(ids.slice(0, 3));
    expect(session.state.slideId).toBe(ids[0]);
    fireEvent.keyDown(grid(), { key: "ArrowDown", shiftKey: true });
    expect(session.state.slideSelection).toEqual(ids.slice(0, 7));
    fireEvent.keyDown(grid(), { key: "Escape" });
    expect(session.state.slideSelection).toEqual([ids[0]]);
    fireEvent.keyDown(grid(), { key: "a", ctrlKey: true });
    expect(session.state.slideSelection).toEqual(ids);
  });

  it("deletes and duplicates the picked slides", async () => {
    const { session, ids } = await setup({ slides: 5 });
    fireEvent.click(tiles()[1]!);
    fireEvent.click(tiles()[2]!, { shiftKey: true });
    fireEvent.keyDown(grid(), { key: "d", ctrlKey: true });
    expect(session.deck.slides).toHaveLength(7);
    expect(session.state.slideSelection).toHaveLength(2);
    fireEvent.keyDown(grid(), { key: "Delete" });
    expect(idsOf(session)).toEqual(ids);
    fireEvent.click(tiles()[3]!);
    fireEvent.keyDown(grid(), { key: "Backspace" });
    expect(idsOf(session)).toEqual(ids.filter((id) => id !== ids[3]));
  });

  it("moves the picked slides with Ctrl+Alt+arrows", async () => {
    const { session, ids } = await setup({ slides: 4 });
    fireEvent.click(tiles()[1]!);
    fireEvent.keyDown(grid(), { key: "ArrowDown", ctrlKey: true, altKey: true });
    expect(idsOf(session)).toEqual([ids[0], ids[2], ids[1], ids[3]]);
  });
});

describe("dragging to reorder", () => {
  const eight = async () => {
    const made = await setup({ slides: 8 });
    return { ...made, ids: idsOf(made.session) as string[] };
  };

  it("moves a slide forward, back and to the ends", async () => {
    const { session, ids } = await eight();
    const [a, b, c, d, e, f, g, h] = ids as [string, string, string, string, string, string, string, string];
    // Over the left half of the sixth tile: the gap before it.
    drag(tiles()[1]!, [over(1), over(5)]);
    expect(idsOf(session)).toEqual([a, c, d, e, b, f, g, h]);
    drag(tiles()[6]!, [over(6), over(0)]);
    expect(idsOf(session)).toEqual([g, a, c, d, e, b, f, h]);
    // Over the right half of the last tile: the end.
    drag(tiles()[0]!, [over(0), over(7, "right")]);
    expect(idsOf(session)).toEqual([a, c, d, e, b, f, h, g]);
  });

  it("moves all the picked slides together", async () => {
    const { session, ids } = await eight();
    const [a, b, c, d, e, f, g, h] = ids as [string, string, string, string, string, string, string, string];
    fireEvent.click(tiles()[1]!);
    fireEvent.click(tiles()[3]!, { ctrlKey: true });
    drag(tiles()[3]!, [over(3), over(6, "right")]);
    expect(idsOf(session)).toEqual([a, c, e, f, g, b, d, h]);
    expect(session.state.slideSelection).toEqual([b, d]);
  });

  it("does nothing when the slide is put back", async () => {
    const { session } = await eight();
    const before = session.deck;
    drag(tiles()[2]!, [over(2), over(2, "right")]);
    drag(tiles()[2]!, [over(2), over(3)]);
    drag(tiles()[2]!, [over(2), over(1, "right")]);
    expect(session.deck).toBe(before);
  });

  it("does nothing when it lets go far outside, or stops on Escape", async () => {
    const { session } = await eight();
    const before = session.deck;
    drag(tiles()[1]!, [over(1), { x: 4000, y: 100 }]);
    expect(session.deck).toBe(before);
    drag(tiles()[1]!, [over(1), over(6)], { release: false });
    expect(document.querySelector(".ks-gv-drop")).not.toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.querySelector(".ks-gv-drop")).toBeNull();
    fireEvent.pointerUp(window, { pointerId: 1, clientX: over(6).x, clientY: over(6).y });
    expect(session.deck).toBe(before);
  });

  it("shows a line where the slides would land: before a tile, or at the end of a row", async () => {
    await eight();
    drag(tiles()[0]!, [over(0), over(6)], { release: false });
    let line = document.querySelector<HTMLElement>(".ks-gv-drop")!;
    // The sixth tile is in the third column of the second row.
    expect(line.style.left).toBe(`${2 * PITCH_X - 12 - 1.5}px`);
    expect(line.style.top).toBe(`${GRID.pitchY}px`);
    expect(line.style.height).toBe(`${GRID.frameHeight}px`);
    fireEvent.pointerMove(window, { pointerId: 1, clientX: over(7, "right").x, clientY: over(7).y });
    line = document.querySelector<HTMLElement>(".ks-gv-drop")!;
    expect(line.style.left).toBe(`${3 * PITCH_X + 262 + 12 - 1.5}px`);
    // Over the slide itself there is nothing to show.
    fireEvent.pointerMove(window, { pointerId: 1, clientX: over(0).x, clientY: over(0).y });
    expect(document.querySelector(".ks-gv-drop")).toBeNull();
    fireEvent.pointerUp(window, { pointerId: 1, clientX: over(0).x, clientY: over(0).y });
    expect(tiles().some((tile) => tile.classList.contains("is-dragging"))).toBe(false);
  });

  it("does not take the click that ends a drag for a click on a slide", async () => {
    const { session, ids } = await eight();
    fireEvent.click(tiles()[1]!);
    fireEvent.click(tiles()[3]!, { ctrlKey: true });
    drag(tiles()[1]!, [over(1), over(7, "right")]);
    fireEvent.click(tiles()[7]!);
    expect(session.state.slideSelection).toEqual([ids[1], ids[3]]);
  });
});

describe("long decks", () => {
  it("draws 300 slides quickly, with thumbnails only near the window", async () => {
    const made = await openDeck({ slides: 300 });
    place();
    const started = performance.now();
    const { container } = render(<GridView session={made.session} ui={made.ui} />);
    const took = performance.now() - started;
    expect(tiles()).toHaveLength(300);
    const drawn = container.querySelectorAll(".ks-gv-frame .ks-thumb").length;
    expect(drawn).toBeGreaterThan(3);
    expect(drawn).toBeLessThan(60);
    expect(drawn + container.querySelectorAll(".ks-gv-frame.is-far").length).toBe(300);
    expect(took).toBeLessThan(1000);
  });

  it("draws the thumbnails that come near the window as it scrolls", async () => {
    const made = await openDeck({ slides: 300 });
    place();
    const { container } = render(<GridView session={made.session} ui={made.ui} />);
    const scroller = container.querySelector(".ks-grid-view") as HTMLElement;
    const drawn = () => [...container.querySelectorAll(".ks-gv-tile")].flatMap((tile, i) => (tile.querySelector(".ks-gv-frame.is-far") ? [] : [i]));
    expect(drawn()[0]).toBe(0);
    scroller.scrollTop = 40 * GRID.pitchY;
    fireEvent.scroll(scroller);
    await waitFor(() => expect(drawn()[0]).toBeGreaterThan(100));
    expect(drawn().includes(0)).toBe(false);
    expect(drawn().includes(165)).toBe(true);
  });

  it("scrolls a slide that is shown from elsewhere into view", async () => {
    vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(function (this: Element) {
      return this.classList.contains("ks-grid-view") ? 600 : 0;
    });
    const { session, container } = await setup({ slides: 40 });
    const scroller = container.querySelector(".ks-grid-view") as HTMLElement;
    act(() => session.goTo(idsOf(session)[39]!));
    // The last row is the tenth; it ends at the foot of the window, less the padding.
    expect(scroller.scrollTop).toBe(28 + 9 * GRID.pitchY + GRID.tileHeight - 600 + 28);
    act(() => session.goTo(idsOf(session)[0]!));
    expect(scroller.scrollTop).toBe(0);
  });
});
