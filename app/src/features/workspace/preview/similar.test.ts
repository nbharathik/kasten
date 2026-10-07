import { describe, expect, it } from "vitest";

import { similarNotes, type SimilarDoc } from "./similar";

const doc = (title: string, body: string, links: string[] = [], kind = "card"): SimilarDoc => ({
  path: `inbox/${title.toLowerCase().replaceAll(" ", "-")}.md`,
  title,
  icon: null,
  kind,
  body,
  links: new Set(links.map((l) => l.toLowerCase())),
});

// Enough other notes that the shared words count as rare.
const filler = Array.from({ length: 40 }, (_, i) => doc(`Note ${i}`, `Something about topic${i} and more topic${i}.`));

describe("similarNotes", () => {
  const starter = doc("Sourdough starter", "Feed the sourdough starter with rye flour and water every morning. The starter smells sour when it is hungry.");
  const bread = doc("Baking bread", "Sourdough bread needs an active starter, flour, water and salt, and a long cold proof.");
  const rye = doc("Rye flour", "The [[Sourdough starter]] likes rye flour best.", ["Sourdough starter"]);
  const garden = doc("Garden plan", "Plant tomatoes and basil in spring, and water them every morning.");
  const template = doc("Starter template", "sourdough starter flour rye", [], "template");
  const docs = [starter, bread, rye, garden, template, ...filler];

  it("finds notes about the same things, the most alike first", () => {
    const found = similarNotes(docs, starter.path, 5);
    const titles = found.map((f) => f.title);
    expect(titles.slice(0, 2).sort()).toEqual(["Baking bread", "Rye flour"]);
    expect(titles).not.toContain("Sourdough starter");
    expect(titles).not.toContain("Starter template");
    const garden = titles.indexOf("Garden plan");
    expect(garden === -1 || garden > 1).toBe(true);
  });

  it("says which words they share and whether they link", () => {
    const found = similarNotes(docs, starter.path, 5);
    const byTitle = (t: string) => found.find((f) => f.title === t)!;
    expect(byTitle("Rye flour").linked).toBe(true);
    expect(byTitle("Baking bread").linked).toBe(false);
    expect(byTitle("Baking bread").shared.slice(0, 2).sort()).toEqual(["sourdough", "starter"]);
    expect(byTitle("Baking bread").shared.length).toBeLessThanOrEqual(3);
  });

  it("leaves out notes that share only one word", () => {
    const run = doc("Hill run", "A run up the hill before breakfast, hungry.");
    const found = similarNotes([...docs, run], starter.path, 10);
    expect(found.map((f) => f.title)).not.toContain("Hill run");
    expect(found.every((f) => f.shared.length >= 2)).toBe(true);
  });

  it("keeps to the limit, and a note with nothing telling has none", () => {
    expect(similarNotes(docs, starter.path, 1)).toHaveLength(1);
    const lonely = doc("Zqxvw", "");
    expect(similarNotes([...docs, lonely], lonely.path, 5)).toEqual([]);
    expect(() => similarNotes(docs, "inbox/nothing.md", 5)).toThrow(/No note/);
  });

  it("does not let long notes crowd out close ones", () => {
    const kiln = doc("Kiln firing", "Stoneware glaze needs a slow kiln firing to cone six.");
    const glaze = doc("Glaze recipes", "A stoneware glaze for cone six.");
    const words = Array.from({ length: 3000 }, (_, i) => `word${i}`).join(" ");
    const everything = doc("Everything", `${words} stoneware glaze kiln firing cone six`);
    expect(similarNotes([kiln, glaze, everything, ...filler], kiln.path, 5)[0]!.title).toBe("Glaze recipes");
  });
});
