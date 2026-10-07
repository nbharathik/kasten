import { describe, expect, it } from "vitest";

import { lastLine, linesOf, nextFocus, normalizeFocus, pastEnd, rangesOf } from "./focus-steps.ts";

describe("an entry for a step", () => {
  it("is lines and ranges, separated by commas", () => {
    expect(rangesOf("1")).toEqual([[1, 1]]);
    expect(rangesOf("2-3")).toEqual([[2, 3]]);
    expect(rangesOf("4,6-10")).toEqual([[4, 4], [6, 10]]);
    expect(rangesOf(" 4 , 6 - 10 ")).toEqual([[4, 4], [6, 10]]);
  });

  it("is nothing else", () => {
    for (const bad of ["", " ", "0", "3-2", "a", "1,,2", "1-", "-1", "1.5", "1-2-3", "1 2", "1;2", "0-3"]) {
      expect(rangesOf(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("is written the way the deck keeps it", () => {
    expect(normalizeFocus("1")).toBe("1");
    expect(normalizeFocus(" 2 - 3 ")).toBe("2-3");
    expect(normalizeFocus("4, 6-10")).toBe("4,6-10");
    expect(normalizeFocus("05")).toBe("5");
    expect(normalizeFocus("5-5")).toBe("5-5");
    expect(normalizeFocus("nope")).toBeNull();
  });

  it("names a last line, which may be past the end of the code", () => {
    expect(lastLine("2-3")).toBe(3);
    expect(lastLine("4,6-10")).toBe(10);
    expect(lastLine("x")).toBe(0);
    expect(pastEnd("6-12", 9)).toBe(true);
    expect(pastEnd("6-9", 9)).toBe(false);
    expect(pastEnd("x", 9)).toBe(false);
  });
});

describe("the entry a new step starts as", () => {
  it("is the first line when there are no steps", () => {
    expect(nextFocus([], 9)).toBe("1");
  });

  it("is the line after the last one looked at", () => {
    expect(nextFocus(["1-4"], 9)).toBe("5");
    expect(nextFocus(["1-4", "5"], 9)).toBe("6");
    expect(nextFocus(["2,7-8"], 9)).toBe("9");
  });

  it("is the first line again when the code has run out", () => {
    expect(nextFocus(["1-9"], 9)).toBe("1");
    expect(nextFocus(["5-20"], 9)).toBe("1");
    expect(nextFocus(["oops"], 9)).toBe("1");
  });
});

describe("the lines of some code", () => {
  it("are counted without the newline at the very end", () => {
    expect(linesOf("")).toBe(0);
    expect(linesOf("a")).toBe(1);
    expect(linesOf("a\nb")).toBe(2);
    expect(linesOf("a\nb\n")).toBe(2);
    expect(linesOf("a\n\nb")).toBe(3);
  });
});
