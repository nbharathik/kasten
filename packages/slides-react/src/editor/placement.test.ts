import type { Element } from "@kasten-slides/wasm";
import { describe, expect, it } from "vitest";

import { newDeck } from "../test/engine.ts";
import { GAP, boxFor, cornerBox, largestFree, occupiedBy } from "./placement.ts";

const slide = { w: 960, h: 540 };
const area = (b: { w: number; h: number }) => b.w * b.h;

describe("the largest free rectangle", () => {
  const frame = { x: 0, y: 0, w: 100, h: 100 };

  it("is the whole frame when nothing is in it", () => {
    expect(largestFree(frame, [])).toEqual(frame);
  });

  it("is what is left beside one thing in a corner", () => {
    // 40 x 40 in the top left: the free rectangles are 60 x 100 (right) and 100 x 60 (below), 6000 each.
    const free = largestFree(frame, [{ x: 0, y: 0, w: 40, h: 40 }]);
    expect(free && area(free)).toBe(6000);
  });

  it("is the band under a title", () => {
    const free = largestFree(frame, [{ x: 0, y: 0, w: 100, h: 20 }]);
    expect(free).toEqual({ x: 0, y: 20, w: 100, h: 80 });
  });

  it("goes round a thing in the middle to the widest side", () => {
    const free = largestFree(frame, [{ x: 40, y: 40, w: 20, h: 20 }]);
    // Above, below, left or right: 100 x 40 above (or below) is 4000, and so is 40 x 100 beside it: the wide one, at the top, is taken.
    expect(free && area(free)).toBe(4000);
    expect(free).toEqual({ x: 0, y: 0, w: 100, h: 40 });
  });

  it("finds a gap between two things", () => {
    const free = largestFree(frame, [
      { x: 0, y: 0, w: 100, h: 10 },
      { x: 0, y: 90, w: 100, h: 10 },
    ]);
    expect(free).toEqual({ x: 0, y: 10, w: 100, h: 80 });
  });

  it("never crosses what is in the way", () => {
    const obstacles = [
      { x: 10, y: 10, w: 30, h: 50 },
      { x: 55, y: 30, w: 40, h: 30 },
      { x: 20, y: 70, w: 70, h: 20 },
    ];
    const free = largestFree(frame, obstacles);
    expect(free).not.toBeNull();
    for (const o of obstacles) {
      const crosses = free!.x < o.x + o.w && free!.x + free!.w > o.x && free!.y < o.y + o.h && free!.y + free!.h > o.y;
      expect(crosses, JSON.stringify(o)).toBe(false);
    }
  });

  it("is as large as brute force says, whatever is in the way", () => {
    // A small deterministic scatter of things, checked against every rectangle on a coarse grid.
    let seed = 7;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let round = 0; round < 25; round++) {
      const obstacles = Array.from({ length: 1 + Math.floor(next() * 6) }, () => {
        const w = 1 + Math.floor(next() * 5) * 10;
        const h = 1 + Math.floor(next() * 5) * 10;
        return { x: Math.floor(next() * 8) * 10, y: Math.floor(next() * 8) * 10, w, h };
      });
      let best = 0;
      for (let x1 = 0; x1 < 100; x1 += 10) {
        for (let x2 = x1 + 10; x2 <= 100; x2 += 10) {
          for (let y1 = 0; y1 < 100; y1 += 10) {
            for (let y2 = y1 + 10; y2 <= 100; y2 += 10) {
              const hit = obstacles.some((o) => x1 < o.x + o.w && x2 > o.x && y1 < o.y + o.h && y2 > o.y);
              if (!hit) best = Math.max(best, (x2 - x1) * (y2 - y1));
            }
          }
        }
      }
      const free = largestFree(frame, obstacles);
      // Edges of things fall between grid lines, so the exact answer is at least the grid's.
      expect(free ? area(free) : 0, JSON.stringify(obstacles)).toBeGreaterThanOrEqual(best);
    }
  });

  it("is null when the frame is covered", () => {
    expect(largestFree(frame, [{ x: -5, y: -5, w: 110, h: 110 }])).toBeNull();
  });

  it("ignores things outside the frame and things with no size", () => {
    expect(largestFree(frame, [{ x: 200, y: 0, w: 10, h: 10 }, { x: 50, y: 50, w: 0, h: 0 }])).toEqual(frame);
  });
});

describe("where a new element goes", () => {
  it("is the middle of an empty slide, at the size it prefers", () => {
    expect(boxFor({ w: 600, h: 260 }, [], slide)).toEqual({ x: 180, y: 140, w: 600, h: 260 });
  });

  it("is the middle of the free band under a title", () => {
    const title = { x: 48, y: 40, w: 864, h: 90 };
    const box = boxFor({ w: 600, h: 260 }, [title], slide);
    expect(box.w).toBe(600);
    expect(box.h).toBe(260);
    expect(box.y).toBeGreaterThanOrEqual(title.y + title.h + GAP);
    expect(box.x + box.w / 2).toBe(480);
  });

  it("keeps clear of what is there, by a gap", () => {
    const left = { x: 48, y: 150, w: 300, h: 340 };
    const box = boxFor({ w: 400, h: 200 }, [left], slide);
    expect(box.x).toBeGreaterThanOrEqual(left.x + left.w + GAP);
  });

  it("shrinks, keeping its shape, to fit the room there is", () => {
    // A band 250 high: a 600 x 300 element becomes about 500 x 250.
    const top = { x: 0, y: 0, w: 960, h: 200 };
    const bottom = { x: 0, y: 440, w: 960, h: 100 };
    const box = boxFor({ w: 600, h: 300 }, [top, bottom], slide);
    expect(box.w / box.h).toBeCloseTo(2, 1);
    expect(box.h).toBeLessThan(300);
    expect(box.y).toBeGreaterThanOrEqual(200 + GAP);
    expect(box.y + box.h).toBeLessThanOrEqual(440 - GAP);
  });

  it("goes in the middle of the slide, over what is there, when there is hardly any room", () => {
    const wall = { x: 0, y: 0, w: 960, h: 500 };
    expect(boxFor({ w: 600, h: 260 }, [wall], slide)).toEqual({ x: 180, y: 140, w: 600, h: 260 });
  });

  it("is never bigger than the slide", () => {
    const box = boxFor({ w: 2000, h: 1200 }, [], slide);
    expect(box.w).toBeLessThanOrEqual(slide.w);
    expect(box.h).toBeLessThanOrEqual(slide.h);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
  });

  it("has whole numbers for a box", () => {
    const box = boxFor({ w: 333, h: 177 }, [{ x: 0, y: 0, w: 960, h: 123 }], slide);
    for (const n of [box.x, box.y, box.w, box.h]) expect(Number.isInteger(n)).toBe(true);
  });
});

describe("a corner of the slide", () => {
  it("is where a small element belongs at the bottom, clear of the edge and of the slide number", () => {
    expect(cornerBox({ w: 140, h: 32 }, "bottom-right", slide)).toEqual({ x: 712, y: 484, w: 140, h: 32 });
    expect(cornerBox({ w: 360, h: 32 }, "bottom-left", slide)).toEqual({ x: 64, y: 484, w: 360, h: 32 });
  });

  it("is taken when nothing is there", () => {
    expect(boxFor({ w: 140, h: 32 }, [], slide, "bottom-right")).toEqual({ x: 712, y: 484, w: 140, h: 32 });
  });

  it("is given up for the largest free place when something is there", () => {
    const body = { x: 48, y: 150, w: 864, h: 370 };
    const box = boxFor({ w: 140, h: 32 }, [body], slide, "bottom-right");
    expect(box).not.toEqual({ x: 712, y: 484, w: 140, h: 32 });
    expect(box.y + box.h).toBeLessThanOrEqual(540);
  });

  it("is taken beside something that is not in the way", () => {
    const beside = { x: 100, y: 100, w: 300, h: 200 };
    expect(boxFor({ w: 140, h: 32 }, [beside], slide, "bottom-right")).toEqual({ x: 712, y: 484, w: 140, h: 32 });
  });
});

describe("an element that has to go over others", () => {
  const wall = { x: 0, y: 0, w: 960, h: 500 };

  it("is moved down and right of one that starts in the same place, so that it does not hide behind it", () => {
    const first = boxFor({ w: 600, h: 260 }, [wall], slide);
    const second = boxFor({ w: 600, h: 260 }, [wall, first], slide);
    expect(second.x).toBeGreaterThan(first.x);
    expect(second.y).toBeGreaterThan(first.y);
    const third = boxFor({ w: 600, h: 260 }, [wall, first, second], slide);
    expect(third.x).toBeGreaterThan(second.x);
  });

  it("stays on the slide however many there are", () => {
    const boxes = [wall];
    for (let n = 0; n < 12; n++) boxes.push(boxFor({ w: 600, h: 260 }, boxes, slide));
    for (const b of boxes.slice(1)) {
      expect(b.x + b.w).toBeLessThanOrEqual(slide.w);
      expect(b.y + b.h).toBeLessThanOrEqual(slide.h);
    }
  });
});

describe("what is in the way on a slide", () => {
  const theme = (async () => (await newDeck("Placement")).deck.theme)();
  const text = (id: string, x: number, y: number, w: number, h: number, words = "Hello", extra: Partial<Element> = {}): Element =>
    ({ type: "text", id, x, y, w, h, text: { paragraphs: [{ runs: [{ t: words }] }] }, ...extra }) as Element;

  it("is every element with something to show", async () => {
    const boxes = occupiedBy(await theme, "blank", [text("a", 10, 10, 100, 40), text("b", 200, 200, 50, 50)], slide);
    expect(boxes).toEqual([
      { x: 10, y: 10, w: 100, h: 40 },
      { x: 200, y: 200, w: 50, h: 50 },
    ]);
  });

  it("leaves out an empty placeholder, which is a prompt in the editor and nothing when presented", async () => {
    const t = await theme;
    const title = text("t", 48, 40, 864, 90, "Title", { placeholder: "title" });
    const empty = text("body", 48, 150, 864, 340, "", { placeholder: "body" });
    const boxes = occupiedBy(t, "title-body", [title, empty], slide);
    expect(boxes).toEqual([{ x: 48, y: 40, w: 864, h: 90 }]);
  });

  it("leaves out an empty picture slot", async () => {
    const slot = { type: "image", id: "i", src: "", placeholder: "image", x: 10, y: 10, w: 300, h: 300 } as unknown as Element;
    expect(occupiedBy(await theme, "blank", [slot], slide)).toEqual([]);
  });

  it("leaves out a background: something that covers most of the slide", async () => {
    const backdrop = { type: "shape", id: "bg", shape: "rect", x: 0, y: 0, w: 960, h: 540 } as unknown as Element;
    expect(occupiedBy(await theme, "blank", [backdrop, text("a", 10, 10, 100, 40)], slide)).toEqual([{ x: 10, y: 10, w: 100, h: 40 }]);
  });

  it("uses the box round what a group holds when the group has none of its own", async () => {
    const group = { type: "group", id: "g", children: [text("a", 100, 100, 50, 50), text("b", 300, 200, 50, 50)] } as unknown as Element;
    expect(occupiedBy(await theme, "blank", [group], slide)).toEqual([{ x: 100, y: 100, w: 250, h: 150 }]);
  });

  it("keeps a line's flat box, which the gap kept round everything then thickens", async () => {
    const line = { type: "line", id: "l", route: "straight", x: 100, y: 300, w: 400, h: 0 } as unknown as Element;
    const [box] = occupiedBy(await theme, "blank", [line], slide);
    expect(box).toEqual({ x: 100, y: 300, w: 400, h: 0 });
  });
});
