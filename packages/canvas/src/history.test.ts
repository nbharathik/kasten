import { describe, expect, it } from "vitest";

import { History } from "./history.ts";

/** A history of letters with each of them pushed in turn. */
const pushed = (...states: string[]) => {
  const h = new History<string>();
  for (const s of states) h.push(s);
  return h;
};

describe("History", () => {
  it("starts empty, with nothing to go to", () => {
    const h = new History<string>();
    expect(h.current).toBeUndefined();
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    expect(h.undo()).toBeUndefined();
    expect(h.redo()).toBeUndefined();
  });

  it("holds its first state without anything to undo to", () => {
    const h = pushed("a");
    expect(h.current).toBe("a");
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    expect(h.undo()).toBeUndefined();
    expect(h.current).toBe("a");
  });

  it("steps back through the states, and forward again", () => {
    const h = pushed("a", "b", "c");
    expect(h.current).toBe("c");
    expect(h.canUndo).toBe(true);
    expect(h.canRedo).toBe(false);

    expect(h.undo()).toBe("b");
    expect(h.current).toBe("b");
    expect(h.canUndo).toBe(true);
    expect(h.canRedo).toBe(true);

    expect(h.undo()).toBe("a");
    expect(h.canUndo).toBe(false);
    expect(h.undo()).toBeUndefined();
    expect(h.current).toBe("a");

    expect(h.redo()).toBe("b");
    expect(h.redo()).toBe("c");
    expect(h.canRedo).toBe(false);
    expect(h.redo()).toBeUndefined();
    expect(h.current).toBe("c");
  });

  it("forgets what could be redone when something new is pushed", () => {
    const h = pushed("a", "b", "c");
    h.undo();
    h.push("d");
    expect(h.current).toBe("d");
    expect(h.canRedo).toBe(false);
    expect(h.redo()).toBeUndefined();
    expect(h.undo()).toBe("b");
    expect(h.undo()).toBe("a");
    expect(h.undo()).toBeUndefined();
  });

  it("pushes after a full undo as a fresh branch", () => {
    const h = pushed("a", "b");
    h.undo();
    h.push("x");
    expect(h.undo()).toBe("a");
    expect(h.redo()).toBe("x");
  });

  it("keeps the states themselves, not copies", () => {
    const state = { n: 1 };
    const h = new History<{ n: number }>();
    h.push(state);
    h.push({ n: 2 });
    expect(h.undo()).toBe(state);
  });

  describe("cap", () => {
    it("is 100 unless set", () => {
      expect(new History().cap).toBe(100);
      expect(new History(5).cap).toBe(5);
    });

    it("keeps that many undo steps and forgets the oldest states", () => {
      const h = new History<number>(3);
      for (let n = 1; n <= 6; n++) h.push(n);
      expect(h.current).toBe(6);
      expect([h.undo(), h.undo(), h.undo()]).toEqual([5, 4, 3]);
      expect(h.canUndo).toBe(false);
      expect(h.undo()).toBeUndefined();
      expect(h.current).toBe(3);
    });

    it("does not lose redo steps when it has forgotten old ones", () => {
      const h = new History<number>(2);
      for (let n = 1; n <= 5; n++) h.push(n);
      h.undo();
      h.undo();
      expect(h.current).toBe(3);
      expect(h.redo()).toBe(4);
      expect(h.redo()).toBe(5);
    });

    it("counts steps, so a cap of 1 keeps one undo", () => {
      const h = new History<string>(1);
      h.push("a");
      h.push("b");
      h.push("c");
      expect(h.undo()).toBe("b");
      expect(h.canUndo).toBe(false);
    });

    it("is at least 1 and a whole number", () => {
      expect(new History(0).cap).toBe(1);
      expect(new History(-5).cap).toBe(1);
      expect(new History(2.7).cap).toBe(2);
      expect(new History(Number.NaN).cap).toBe(100);
    });

    it("can be unlimited", () => {
      const h = new History<number>(Number.POSITIVE_INFINITY);
      for (let n = 0; n < 500; n++) h.push(n);
      for (let n = 0; n < 499; n++) h.undo();
      expect(h.current).toBe(0);
    });
  });

  describe("clear", () => {
    it("forgets everything, the current state too", () => {
      const h = pushed("a", "b", "c");
      h.undo();
      h.clear();
      expect(h.current).toBeUndefined();
      expect(h.canUndo).toBe(false);
      expect(h.canRedo).toBe(false);
      expect(h.undo()).toBeUndefined();
      expect(h.redo()).toBeUndefined();
    });

    it("lets the history begin again", () => {
      const h = pushed("a", "b");
      h.clear();
      h.push("x");
      expect(h.current).toBe("x");
      expect(h.canUndo).toBe(false);
      h.push("y");
      expect(h.undo()).toBe("x");
    });

    it("keeps its cap", () => {
      const h = new History<number>(2);
      h.clear();
      expect(h.cap).toBe(2);
    });
  });
});
