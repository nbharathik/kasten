import { describe, expect, it } from "vitest";

import { score } from "./Palette";

describe("palette matching", () => {
  it("ranks exact, prefix, word and substring matches", () => {
    expect(score("Roadmap", "roadmap")).toBe(100);
    expect(score("Roadmap 2026", "road")).toBe(80);
    expect(score("Photo organiser roadmap", "road")).toBe(60);
    expect(score("Railroad", "road")).toBe(40);
    expect(score("Report draft: old notes", "report notes")).toBe(20);
    expect(score("Paper", "zebra")).toBe(0);
  });

  it("finds titles by their words' first letters, and with one typo", () => {
    expect(score("Zettelkasten method", "zm")).toBe(30);
    expect(score("Weekly plan and review", "wpr")).toBe(30);
    expect(score("Zettelkasten method", "zettlekasten")).toBe(25);
    expect(score("Meeting notes", "meetnig")).toBe(25);
    expect(score("Meeting notes", "notse")).toBe(25);
    expect(score("Meeting notes", "metting")).toBe(25);
    // Short queries and two typos find nothing this way.
    expect(score("Meeting notes", "mtg")).toBe(0);
    expect(score("Meeting notes", "mettnig")).toBe(0);
    // Any real match still ranks above.
    expect(score("Zoom meetings", "zoom")).toBeGreaterThan(30);
  });
});
