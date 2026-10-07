import type { Paragraph } from "@kasten-slides/wasm";
import { describe, expect, it } from "vitest";

import { levelOf, listNumbers, markerFor } from "./lists.ts";

const item = (list: "bullet" | "number" | null, level?: number): Paragraph => ({ runs: [{ t: "x" }], ...(list ? { list } : {}), ...(level === undefined ? {} : { level }) });

describe("markerFor", () => {
  it("draws bullets by level and starts again after the third", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((level) => markerFor(item("bullet", level), 1))).toEqual(["•", "–", "▪", "•", "–", "▪", "•"]);
    expect(markerFor(item("bullet"), 5)).toBe("•");
  });

  it("numbers level 0 with 1. 2. 3.", () => {
    expect([1, 2, 3, 10, 123].map((n) => markerFor(item("number", 0), n))).toEqual(["1.", "2.", "3.", "10.", "123."]);
    expect(markerFor(item("number"), 2)).toBe("2.");
  });

  it("numbers level 1 with letters, counting on after z like spreadsheet columns", () => {
    expect([1, 2, 26, 27, 28, 52, 53, 702, 703].map((n) => markerFor(item("number", 1), n))).toEqual(["a.", "b.", "z.", "aa.", "ab.", "az.", "ba.", "zz.", "aaa."]);
  });

  it("numbers level 2 with Roman numerals", () => {
    expect([1, 2, 3, 4, 5, 9, 14, 40, 90, 400, 1994, 3999].map((n) => markerFor(item("number", 2), n))).toEqual([
      "i.", "ii.", "iii.", "iv.", "v.", "ix.", "xiv.", "xl.", "xc.", "cd.", "mcmxciv.", "mmmcmxcix.",
    ]);
    expect(markerFor(item("number", 2), 4000)).toBe("4000.");
  });

  it("repeats the cycle from level 3", () => {
    expect(markerFor(item("number", 3), 2)).toBe("2.");
    expect(markerFor(item("number", 4), 2)).toBe("b.");
    expect(markerFor(item("number", 5), 2)).toBe("ii.");
    expect(markerFor(item("number", 6), 3)).toBe("3.");
  });

  it("counts from 1 whatever it is given", () => {
    expect(markerFor(item("number", 0), 0)).toBe("1.");
    expect(markerFor(item("number", 0), -4)).toBe("1.");
    expect(markerFor(item("number", 0), 2.9)).toBe("2.");
    expect(markerFor(item("number", 0), Number.NaN)).toBe("1.");
  });

  it("has no marker for a paragraph that is not a list item", () => {
    expect(markerFor(item(null), 1)).toBe("");
  });
});

describe("levelOf", () => {
  it("is a whole number from 0", () => {
    expect(levelOf({})).toBe(0);
    expect(levelOf({ level: null })).toBe(0);
    expect(levelOf({ level: 3 })).toBe(3);
    expect(levelOf({ level: -2 })).toBe(0);
    expect(levelOf({ level: 1.7 })).toBe(1);
    expect(levelOf({ level: Number.NaN })).toBe(0);
  });
});

describe("listNumbers", () => {
  const numbers = (rows: [("bullet" | "number" | null), number?][]): (number | null)[] => listNumbers(rows.map(([list, level]) => item(list, level)));

  it("counts a run of numbered paragraphs", () => {
    expect(numbers([["number"], ["number"], ["number"]])).toEqual([1, 2, 3]);
  });

  it("gives plain paragraphs and bullets no number", () => {
    expect(numbers([[null], ["bullet"], ["number"]])).toEqual([null, null, 1]);
  });

  it("starts again after a plain paragraph", () => {
    expect(numbers([["number"], ["number"], [null], ["number"], ["number"]])).toEqual([1, 2, null, 1, 2]);
  });

  it("starts again after a bullet at the same level", () => {
    expect(numbers([["number"], ["number"], ["bullet"], ["number"]])).toEqual([1, 2, null, 1]);
  });

  it("is not interrupted by items nested deeper", () => {
    expect(numbers([["number", 0], ["number", 1], ["number", 1], ["number", 0], ["number", 1]])).toEqual([1, 1, 2, 2, 1]);
    expect(numbers([["number", 0], ["bullet", 1], ["number", 0]])).toEqual([1, null, 2]);
  });

  it("starts the inner count again under each outer item", () => {
    expect(numbers([["number", 0], ["number", 1], ["number", 1], ["number", 0], ["number", 1], ["number", 2], ["number", 2]])).toEqual([1, 1, 2, 2, 1, 1, 2]);
  });

  it("counts a list that starts deeper than level 0", () => {
    expect(numbers([["number", 2], ["number", 2], ["number", 0], ["number", 2]])).toEqual([1, 2, 1, 1]);
  });

  it("is empty for no paragraphs", () => {
    expect(listNumbers([])).toEqual([]);
  });
});
