// Every icon part keeps its drawing: a line with no ends draws nothing.

import { describe, expect, it } from "vitest";

import { ICONS } from "./icons";

describe("the icon set", () => {
  it("has no part without its attributes", () => {
    const empty = Object.entries(ICONS).flatMap(([name, parts]) =>
      parts.filter(([, attrs]) => Object.keys(attrs).length === 0).map(([tag]) => `${name}: ${tag}`),
    );
    expect(empty).toEqual([]);
  });

  it("draws the lines of hash, monitor and zoom-in", () => {
    for (const name of ["hash", "monitor", "zoom-in"] as const) {
      const lines = ICONS[name].filter(([tag]) => tag === "line");
      expect(lines.length, name).toBeGreaterThan(0);
      for (const [, attrs] of lines) expect(Object.keys(attrs).sort(), name).toEqual(["x1", "x2", "y1", "y2"]);
    }
  });
});
