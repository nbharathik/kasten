import { describe, expect, it } from "vitest";

import { rank, scoreOf } from "./palette-rank.ts";

const entry = (label: string, keywords: string[] = [], group = "Insert") => ({ label, keywords, group });
const labels = (query: string, entries: ReturnType<typeof entry>[]) => rank(query, entries).map((e) => e.label);

describe("what the words typed match", () => {
  it("is nothing for a word that is in no name and no keyword", () => {
    expect(scoreOf("zebra", entry("Code block", ["source"]))).toBe(0);
  });

  it("ignores case and the spaces round the words", () => {
    expect(scoreOf("  CODE ", entry("Code block"))).toBeGreaterThan(0);
  });

  it("needs every word to match, in any order", () => {
    expect(scoreOf("block code", entry("Code block"))).toBeGreaterThan(0);
    expect(scoreOf("code circle", entry("Code block"))).toBe(0);
  });

  it("scores the start of the name above the start of a word, that above the inside of a word, and that above a keyword", () => {
    const start = scoreOf("form", entry("Formula"));
    const word = scoreOf("form", entry("Insert form"));
    const inside = scoreOf("orm", entry("Formula"));
    const keyword = scoreOf("latex", entry("Formula", ["latex"]));
    expect(start).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(inside);
    expect(inside).toBeGreaterThan(keyword);
    expect(keyword).toBeGreaterThan(0);
  });

  it("scores a whole word above the start of a longer one", () => {
    expect(scoreOf("line", entry("Line"))).toBeGreaterThan(scoreOf("line", entry("Linear gradient")));
  });

  it("finds the letters of a longer word in order, when nothing better matches", () => {
    expect(scoreOf("fmla", entry("Formula"))).toBeGreaterThan(0);
    expect(scoreOf("flmra", entry("Formula"))).toBe(0);
  });

  it("does not match one or two letters that are only scattered through a name", () => {
    expect(scoreOf("fa", entry("Formula"))).toBe(0);
    expect(scoreOf("fo", entry("Formula"))).toBeGreaterThan(0);
  });

  it("matches the name of the group too, but weakly", () => {
    const viaGroup = scoreOf("slides", entry("Title and body", [], "Slides"));
    expect(viaGroup).toBeGreaterThan(0);
    expect(viaGroup).toBeLessThan(scoreOf("title", entry("Title and body", [], "Slides")));
  });
});

describe("the entries in order of how well they match", () => {
  const entries = [
    entry("Table…", ["grid"]),
    entry("Formula", ["equation", "latex"]),
    entry("Format options", []),
    entry("Code block", ["source"]),
    entry("Card grid", ["cards", "tiles"]),
    entry("Conversation", ["chat"]),
    entry("Insert form field", []),
  ];

  it("keeps the order it was given when nothing is typed", () => {
    expect(labels("", entries)).toEqual(entries.map((e) => e.label));
    expect(labels("   ", entries)).toEqual(entries.map((e) => e.label));
  });

  it("puts names that start with the word before names that contain it", () => {
    expect(labels("form", entries)).toEqual(["Formula", "Format options", "Insert form field"]);
  });

  it("finds an entry by a keyword it was given", () => {
    expect(labels("equation", entries)).toEqual(["Formula"]);
    expect(labels("chat", entries)).toEqual(["Conversation"]);
  });

  it("finds the same entry by its name or by a word for it, ranking the name first", () => {
    expect(labels("grid", entries)).toEqual(["Card grid", "Table…"]);
  });

  it("leaves out what does not match", () => {
    expect(labels("qqq", entries)).toEqual([]);
  });

  it("puts the shorter name first when two match alike", () => {
    expect(labels("c", [entry("Center align"), entry("Cut")])).toEqual(["Cut", "Center align"]);
  });

  it("keeps the given order among entries that match equally", () => {
    const same = [entry("Circle a"), entry("Circle b"), entry("Circle c")];
    expect(labels("circle", same)).toEqual(["Circle a", "Circle b", "Circle c"]);
  });

  it("takes an entry whose name has the whole query at its start over one that has the words apart", () => {
    expect(labels("new slide", [entry("Slide: new layout"), entry("New slide: Title")])[0]).toBe("New slide: Title");
  });
});
