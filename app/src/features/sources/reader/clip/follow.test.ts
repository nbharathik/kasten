import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { follow } from "./follow";

let scroller: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
  scroller = document.createElement("div");
  document.body.append(scroller);
  // A pane 600 pixels high and 800 wide, at the window's top left; jsdom lays nothing out.
  vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}) });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  scroller.remove();
});

/** A pointer event with the button held, as a drag has it. */
const pointer = (type: string, clientX: number, clientY: number, target: EventTarget = document.body, buttons = 1) => target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX, clientY, buttons }));

describe("following a pointer", () => {
  it("tells each move, and the end once", () => {
    const moves: number[][] = [];
    const end = vi.fn();
    follow(null, { clientX: 5, clientY: 5 }, (p) => moves.push([p.clientX, p.clientY]), end);
    pointer("pointermove", 10, 20);
    pointer("pointermove", 30, 40);
    pointer("pointerup", 30, 40);
    pointer("pointermove", 50, 60);
    pointer("pointerup", 50, 60);
    expect(moves).toEqual([
      [10, 20],
      [30, 40],
    ]);
    expect(end).toHaveBeenCalledOnce();
  });

  it("hears the release though the thing it happens over stops it going up", () => {
    const end = vi.fn();
    follow(null, { clientX: 0, clientY: 0 }, () => {}, end);
    const over = document.createElement("div");
    over.addEventListener("pointerup", (event) => event.stopPropagation());
    document.body.append(over);
    pointer("pointerup", 1, 1, over);
    over.remove();
    expect(end).toHaveBeenCalledOnce();
  });

  it("ends at a move with no button held: the release was somewhere it could not be heard", () => {
    const moves = vi.fn();
    const end = vi.fn();
    follow(null, { clientX: 0, clientY: 0 }, moves, end);
    pointer("pointermove", 10, 10);
    pointer("pointermove", 20, 20, document.body, 0);
    pointer("pointermove", 30, 30);
    expect(moves).toHaveBeenCalledOnce();
    expect(end).toHaveBeenCalledOnce();
  });

  it("ends when the pointer is taken away", () => {
    const end = vi.fn();
    follow(null, { clientX: 0, clientY: 0 }, () => {}, end);
    pointer("pointercancel", 0, 0);
    expect(end).toHaveBeenCalledOnce();
  });

  it("stops quietly: no more moves, and the end is not told", () => {
    const move = vi.fn();
    const end = vi.fn();
    const following = follow(null, { clientX: 0, clientY: 0 }, move, end);
    following.stop();
    pointer("pointermove", 10, 10);
    pointer("pointerup", 10, 10);
    expect(move).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
  });
});

describe("scrolling while the pointer rests near an edge", () => {
  it("scrolls down a frame at a time while the pointer is near the bottom, and tells the move each time", () => {
    const move = vi.fn();
    follow(scroller, { clientX: 400, clientY: 300 }, move, () => {});
    // Near the bottom edge (within 56 pixels of 600). jsdom does not scroll, so the position is kept by hand.
    let top = 0;
    Object.defineProperty(scroller, "scrollTop", { get: () => top, set: (n: number) => void (top = n), configurable: true });
    pointer("pointermove", 400, 590);
    expect(move).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(16);
    expect(top).toBeGreaterThan(0);
    expect(move).toHaveBeenCalledTimes(2);
    const first = top;
    vi.advanceTimersByTime(16);
    expect(top).toBeGreaterThan(first);
    expect(move).toHaveBeenCalledTimes(3);
  });

  it("scrolls up near the top, and sideways near the sides", () => {
    follow(scroller, { clientX: 400, clientY: 300 }, () => {}, () => {});
    let top = 200;
    let left = 200;
    Object.defineProperty(scroller, "scrollTop", { get: () => top, set: (n: number) => void (top = n), configurable: true });
    Object.defineProperty(scroller, "scrollLeft", { get: () => left, set: (n: number) => void (left = n), configurable: true });
    pointer("pointermove", 795, 10);
    vi.advanceTimersByTime(16);
    expect(top).toBeLessThan(200);
    expect(left).toBeGreaterThan(200);
  });

  it("does not scroll while the pointer is in the middle, or after it is let go", () => {
    const move = vi.fn();
    follow(scroller, { clientX: 400, clientY: 300 }, move, () => {});
    let top = 0;
    Object.defineProperty(scroller, "scrollTop", { get: () => top, set: (n: number) => void (top = n), configurable: true });
    pointer("pointermove", 400, 300);
    vi.advanceTimersByTime(100);
    expect(top).toBe(0);
    pointer("pointermove", 400, 595);
    pointer("pointerup", 400, 595);
    const seen = move.mock.calls.length;
    vi.advanceTimersByTime(100);
    expect(top).toBe(0);
    expect(move).toHaveBeenCalledTimes(seen);
  });
});
