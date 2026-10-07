// @vitest-environment node

import type { Text } from "@kasten-slides/wasm";
import { describe, expect, it } from "vitest";

import { labelBox } from "./label-box.ts";
import { plainTheme } from "./testing/decks.ts";

const text = (...lines: string[]): Text => ({ paragraphs: lines.map((t) => ({ runs: [{ t }] })) });
const theme = { ...plainTheme(), textStyles: { caption: { size: 12, color: "text2", font: "body" } } };

describe("labelBox", () => {
  it("is as wide as the words are long, with the insets around them", () => {
    const short = labelBox(theme, text("yes"));
    const long = labelBox(theme, text("yes, and then some more"));
    expect(long.w).toBeGreaterThan(short.w);
    // 12 pt is 16 units; 3 letters at 0.55 of that, and 9.6 either side.
    expect(short.w).toBeCloseTo(3 * 16 * 0.55 + 19.2, 5);
    expect(short.h).toBeCloseTo(16 * 1.25 + 9.6, 5);
  });

  it("is a line taller for each line of text, also when they are runs with a line break", () => {
    const one = labelBox(theme, text("a"));
    expect(labelBox(theme, text("a", "b")).h - one.h).toBeCloseTo(20, 5);
    expect(labelBox(theme, text("a\nb")).h - one.h).toBeCloseTo(20, 5);
  });

  it("goes by the biggest size a run names, else by the caption style", () => {
    const big: Text = { paragraphs: [{ runs: [{ t: "abc", size: 24 }] }] };
    expect(labelBox(theme, big).h).toBeGreaterThan(labelBox(theme, text("abc")).h);
    const bare = { ...theme, textStyles: {} };
    expect(labelBox(bare, text("abc")).h).toBeCloseTo((14 * 4) / 3 * 1.25 + 9.6, 5);
  });

  it("has a least width and a greatest width", () => {
    expect(labelBox(theme, text("")).w).toBeGreaterThanOrEqual(24);
    expect(labelBox(theme, text("x".repeat(500))).w).toBe(320);
  });

  it("takes the insets the text names", () => {
    const wide: Text = { ...text("abc"), insets: { left: 30, right: 30, top: 0, bottom: 0 } };
    expect(labelBox(theme, wide).w).toBeCloseTo(3 * 16 * 0.55 + 60, 5);
    expect(labelBox(theme, wide).h).toBeCloseTo(16 * 1.25, 5);
  });
});
