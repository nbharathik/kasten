import { describe, expect, it } from "vitest";

import { BLOCK_CHOICES, matchChoices, SLASH_CHOICES, TURN_INTO } from "./catalog";

const keys = (query: string) => matchChoices(SLASH_CHOICES, query).map((c) => c.key);

describe("slash menu matching", () => {
  it("offers every block in Notion's order before a query", () => {
    expect(keys("").slice(0, 13)).toEqual(["text", "h1", "h2", "h3", "bullet", "numbered", "todo", "toggle", "page", "quote", "divider", "callout", "link"]);
    expect(keys("")).toHaveLength(SLASH_CHOICES.length);
  });

  it("finds blocks by Notion's shorthands", () => {
    expect(keys("h1")[0]).toBe("h1");
    expect(keys("todo")[0]).toBe("todo");
    expect(keys("bul")[0]).toBe("bullet");
    expect(keys("num")[0]).toBe("numbered");
    expect(keys("hr")[0]).toBe("divider");
    expect(keys("page")[0]).toBe("page");
    expect(keys("[[")[0]).toBe("link");
    expect(keys("math")).toEqual(["math", "inline-equation"]);
    expect(keys("$$")[0]).toBe("math");
    expect(keys("details")[0]).toBe("toggle");
  });

  it("matches words inside labels, and ignores case", () => {
    expect(keys("LIST")).toEqual(expect.arrayContaining(["bullet", "numbered", "todo", "toggle"]));
    // A table block first, then a database of notes as a table.
    expect(keys("table")).toEqual(["table", "table-view", "database"]);
    expect(keys("gallery")).toEqual(["gallery-view", "database"]);
  });

  it("finds colours and their backgrounds", () => {
    expect(keys("red")).toEqual(["color-red", "background-red"]);
    expect(keys("yellow back")).toEqual(["background-yellow"]);
  });

  it("finds nothing for nonsense", () => {
    expect(keys("zzz")).toEqual([]);
  });
});

describe("turn into", () => {
  it("offers only kinds the slash menu knows", () => {
    const known = new Set(BLOCK_CHOICES.map((c) => c.key));
    expect(TURN_INTO.every((kind) => known.has(kind))).toBe(true);
  });
});
