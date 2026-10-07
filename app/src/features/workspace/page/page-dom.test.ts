import { describe, expect, it } from "vitest";

import { countWords, headingsIn, pageText } from "./page-dom";

describe("page reading", () => {
  it("counts words, characters and reading time", () => {
    expect(countWords("")).toEqual({ words: 0, characters: 0, minutes: 0 });
    expect(countWords("Hello, world — it's 2026!")).toEqual({ words: 4, characters: 21, minutes: 1 });
    expect(countWords("word ".repeat(700)).minutes).toBe(3);
  });

  it("reads headings and text from the page", () => {
    const root = document.createElement("div");
    root.innerHTML = '<div class="ProseMirror"><h1>Intro</h1><p>One two</p><ul><li><p>three</p></li></ul><h3> </h3><h2>End</h2></div>';
    expect(headingsIn(root).map((h) => [h.level, h.text])).toEqual([
      [1, "Intro"],
      [2, "End"],
    ]);
    expect(pageText(root)).toBe("Intro\nOne two\nthree\n \nEnd");
  });
});
