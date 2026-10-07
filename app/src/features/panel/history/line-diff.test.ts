import { describe, expect, it } from "vitest";

import { diffCounts, lineDiff, linesOf, type DiffLine } from "./line-diff";

/** A diff as `  same`, `- removed` and `+ added` lines. */
const show = (diff: DiffLine[]) => diff.map((d) => `${d.kind === "same" ? " " : d.kind === "added" ? "+" : "-"} ${d.text}`);

describe("line diff", () => {
  it("splits lines without a phantom last line", () => {
    expect(linesOf("")).toEqual([]);
    expect(linesOf("a\nb\n")).toEqual(["a", "b"]);
    expect(linesOf("a\r\nb")).toEqual(["a", "b"]);
    expect(linesOf("\n")).toEqual([""]);
  });

  it("marks nothing when the texts match, whatever the line endings", () => {
    expect(show(lineDiff("a\nb\n", "a\r\nb"))).toEqual(["  a", "  b"]);
    expect(lineDiff("", "")).toEqual([]);
  });

  it("finds added, removed and changed lines", () => {
    expect(show(lineDiff("a\nb\nc\n", "a\nc\n"))).toEqual(["  a", "- b", "  c"]);
    expect(show(lineDiff("a\nc\n", "a\nb\nc\n"))).toEqual(["  a", "+ b", "  c"]);
    expect(show(lineDiff("a\nold\nc\n", "a\nnew\nc\n"))).toEqual(["  a", "- old", "+ new", "  c"]);
    expect(show(lineDiff("", "x\n"))).toEqual(["+ x"]);
    expect(show(lineDiff("x\n", ""))).toEqual(["- x"]);
  });

  it("keeps the longest common run of lines", () => {
    const before = "title\none\ntwo\nthree\nfour\n";
    const after = "title\nzero\none\nthree\nfour\nfive\n";
    expect(show(lineDiff(before, after))).toEqual(["  title", "+ zero", "  one", "- two", "  three", "  four", "+ five"]);
    expect(diffCounts(lineDiff(before, after))).toEqual({ added: 2, removed: 1 });
  });

  it("matches moved blocks as well as a subsequence can", () => {
    const diff = lineDiff("A\nB\nC\nD\n", "C\nD\nA\nB\n");
    expect(diff.filter((d) => d.kind === "same")).toHaveLength(2);
    expect(diffCounts(diff)).toEqual({ added: 2, removed: 2 });
  });

  it("falls back to removed-then-added for a huge middle", () => {
    const before = Array.from({ length: 50 }, (_, i) => `old ${i}`).join("\n");
    const after = Array.from({ length: 50 }, (_, i) => `new ${i}`).join("\n");
    const diff = lineDiff(`same\n${before}\nend`, `same\n${after}\nend`, 100);
    expect(diff[0]).toEqual({ kind: "same", text: "same" });
    expect(diff.at(-1)).toEqual({ kind: "same", text: "end" });
    expect(diff.slice(1, 51).every((d) => d.kind === "removed")).toBe(true);
    expect(diff.slice(51, 101).every((d) => d.kind === "added")).toBe(true);
  });
});
