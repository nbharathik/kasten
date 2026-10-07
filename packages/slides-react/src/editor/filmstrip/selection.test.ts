import { describe, expect, it } from "vitest";

import { extendedBy, extendedTo, neighbour, rangeBetween, toggled } from "./selection.ts";

const order = ["a", "b", "c", "d", "e"];

describe("rangeBetween", () => {
  it("takes both ends, whichever is first", () => {
    expect(rangeBetween(order, "b", "d")).toEqual(["b", "c", "d"]);
    expect(rangeBetween(order, "d", "b")).toEqual(["b", "c", "d"]);
    expect(rangeBetween(order, "c", "c")).toEqual(["c"]);
    expect(rangeBetween(order, "x", "c")).toEqual(["c"]);
    expect(rangeBetween(order, "c", "x")).toEqual([]);
  });
});

describe("toggled", () => {
  it("adds a slide and shows it", () => {
    expect(toggled(order, ["b"], "b", "d")).toEqual({ ids: ["b", "d"], show: "d" });
    expect(toggled(order, ["d"], "d", "a")).toEqual({ ids: ["a", "d"], show: "a" });
  });

  it("takes a slide away and keeps the shown one, or shows the one before", () => {
    expect(toggled(order, ["b", "d"], "d", "b")).toEqual({ ids: ["d"], show: "d" });
    expect(toggled(order, ["a", "b", "d"], "d", "d")).toEqual({ ids: ["a", "b"], show: "b" });
    expect(toggled(order, ["b", "d"], "b", "b")).toEqual({ ids: ["d"], show: "d" });
  });

  it("does not take away the last slide", () => {
    expect(toggled(order, ["b"], "b", "b")).toBeNull();
  });
});

describe("extendedTo", () => {
  it("picks the range from the shown slide and keeps it shown", () => {
    expect(extendedTo(order, "b", "d")).toEqual({ ids: ["b", "c", "d"], show: "b" });
    expect(extendedTo(order, "d", "a")).toEqual({ ids: ["a", "b", "c", "d"], show: "d" });
  });

  it("takes just the clicked slide when the shown one cannot be seen", () => {
    expect(extendedTo(order, "zz", "c")).toEqual({ ids: ["c"], show: "c" });
  });
});

describe("neighbour", () => {
  const everything = new Set(order);
  it("steps over the slides that can be seen", () => {
    expect(neighbour(order, everything, "b", 1)).toBe("c");
    expect(neighbour(order, everything, "b", -1)).toBe("a");
    expect(neighbour(order, everything, "b", 3)).toBe("e");
    expect(neighbour(order, everything, "a", -1)).toBeUndefined();
    expect(neighbour(order, everything, "e", 1)).toBeUndefined();
  });

  it("skips slides that are folded away, even from one of them", () => {
    const seen = new Set(["a", "e"]);
    expect(neighbour(order, seen, "a", 1)).toBe("e");
    expect(neighbour(order, seen, "c", 1)).toBe("e");
    expect(neighbour(order, seen, "c", -1)).toBe("a");
  });

  it("goes as far as it can when asked for more", () => {
    expect(neighbour(order, everything, "c", 9)).toBe("e");
  });
});

describe("extendedBy", () => {
  it("grows the selection at its far end and keeps the anchor", () => {
    expect(extendedBy(order, ["b"], "b", 1)).toEqual(["b", "c"]);
    expect(extendedBy(order, ["b", "c"], "b", 1)).toEqual(["b", "c", "d"]);
    expect(extendedBy(order, ["b"], "b", -1)).toEqual(["a", "b"]);
  });

  it("shrinks it when it goes back toward the anchor", () => {
    expect(extendedBy(order, ["b", "c", "d"], "b", -1)).toEqual(["b", "c"]);
    expect(extendedBy(order, ["b", "c", "d"], "d", 1)).toEqual(["c", "d"]);
    expect(extendedBy(order, ["b", "c"], "b", -1)).toEqual(["b"]);
  });

  it("does nothing at the ends", () => {
    expect(extendedBy(order, ["a"], "a", -1)).toBeNull();
    expect(extendedBy(order, ["c", "d", "e"], "c", 1)).toBeNull();
    expect(extendedBy(order, ["zz"], "zz", 1)).toBeNull();
  });
});
