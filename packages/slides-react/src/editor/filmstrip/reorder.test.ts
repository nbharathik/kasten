import { describe, expect, it } from "vitest";

import { idsOf, openDeck } from "./test-support.ts";
import { planMove } from "./reorder.ts";

const order = ["A", "B", "C", "D", "E"];
const after = (moving: string[], gap: number) => planMove(order, moving, gap).result.join("");

describe("planMove", () => {
  it("moves one slide down", () => {
    // The gap is the place between slides: 3 is between C and D.
    expect(after(["B"], 3)).toBe("ACBDE");
    expect(planMove(order, ["B"], 3).to).toBe(2);
    expect(after(["B"], 4)).toBe("ACDBE");
    expect(planMove(order, ["B"], 4).to).toBe(3);
  });

  it("moves one slide up", () => {
    expect(after(["D"], 1)).toBe("ADBCE");
    expect(planMove(order, ["D"], 1).to).toBe(1);
    expect(after(["E"], 0)).toBe("EABCD");
  });

  it("moves a slide to either end", () => {
    expect(after(["C"], 0)).toBe("CABDE");
    expect(planMove(order, ["C"], 0).to).toBe(0);
    expect(after(["B"], 5)).toBe("ACDEB");
    expect(planMove(order, ["B"], 5).to).toBe(4);
  });

  it("moves several slides together and keeps their order", () => {
    expect(after(["B", "D"], 0)).toBe("BDACE");
    expect(after(["B", "D"], 5)).toBe("ACEBD");
    expect(after(["B", "D"], 3)).toBe("ACBDE");
    // However they were picked.
    expect(after(["D", "B"], 0)).toBe("BDACE");
    expect(planMove(order, ["D", "B"], 0).ids).toEqual(["B", "D"]);
    // A gap inside the block is counted among the slides that stay.
    expect(after(["B", "D"], 2)).toBe("ABDCE");
    expect(planMove(order, ["B", "D"], 2).to).toBe(1);
    expect(after(["A", "B"], 5)).toBe("CDEAB");
  });

  it("finds a move that changes nothing", () => {
    // Before the slide, after it, or anywhere beside a block that is together.
    expect(planMove(order, ["B"], 1).changed).toBe(false);
    expect(planMove(order, ["B"], 2).changed).toBe(false);
    for (const gap of [1, 2, 3]) expect(planMove(order, ["B", "C"], gap).changed).toBe(false);
    expect(planMove(order, ["A"], 0).changed).toBe(false);
    expect(planMove(order, ["E"], 5).changed).toBe(false);
    expect(planMove(order, ["A", "B", "C", "D", "E"], 2).changed).toBe(false);
    expect(planMove(order, ["B"], 3).changed).toBe(true);
  });

  it("keeps a gap that is out of range on the list", () => {
    expect(after(["A"], 99)).toBe("BCDEA");
    expect(after(["E"], -3)).toBe("EABCD");
  });
});

describe("planMove and the engine", () => {
  // The position the engine takes and the order it makes must be what was worked out.
  const cases: { name: string; picks: number[]; gap: number }[] = [
    { name: "one down", picks: [1], gap: 4 },
    { name: "one up", picks: [3], gap: 1 },
    { name: "to the start", picks: [2], gap: 0 },
    { name: "to the end", picks: [1], gap: 5 },
    { name: "several to the start", picks: [1, 3], gap: 0 },
    { name: "several to the end", picks: [0, 2], gap: 5 },
    { name: "several into the middle", picks: [0, 4], gap: 3 },
    { name: "a block down", picks: [0, 1], gap: 4 },
    { name: "into itself", picks: [1, 3], gap: 2 },
  ];
  for (const { name, picks, gap } of cases) {
    it(`agrees with move_slides: ${name}`, async () => {
      const { session, errors } = await openDeck({ slides: 5 });
      const before = idsOf(session);
      const plan = planMove(before, picks.map((place) => before[place]!), gap);
      session.slides.move(plan.ids, plan.to);
      expect(errors).toEqual([]);
      expect(idsOf(session)).toEqual(plan.result);
    });
  }
});
