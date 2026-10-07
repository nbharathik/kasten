import { describe, expect, it } from "vitest";

import { changedSpan, countChanges, diffLines, foldUnchanged, pairRows, partners, rowChanged, splitLines, type DiffLine, type Piece } from "./diff";

const signs = (lines: DiffLine[]) => lines.map((l) => `${l.kind === "same" ? " " : l.kind === "del" ? "-" : "+"}${l.text}`);

/** Folded pieces as text: items by index, folds as `~count`. */
const shape = <T,>(pieces: Piece<T>[]) => pieces.map((p) => ("fold" in p ? `~${p.count}` : String(p.index)));

describe("splitLines", () => {
  it("drops line ends, and a final line end adds no empty line", () => {
    expect(splitLines("a\nb\n")).toEqual(["a", "b"]);
    expect(splitLines("a\r\nb")).toEqual(["a", "b"]);
    expect(splitLines("\n")).toEqual([""]);
    expect(splitLines("")).toEqual([]);
    expect(splitLines(null)).toEqual([]);
  });
});

describe("diffLines", () => {
  it("keeps common lines and numbers each side", () => {
    const lines = diffLines("one\ntwo\nthree\n", "one\n2\nthree\nfour\n");
    expect(signs(lines)).toEqual([" one", "-two", "+2", " three", "+four"]);
    expect(lines.map((l) => [l.a ?? null, l.b ?? null])).toEqual([
      [1, 1],
      [2, null],
      [null, 2],
      [3, 3],
      [null, 4],
    ]);
  });

  it("puts removals before additions inside a change", () => {
    expect(signs(diffLines("x\na\nb\ny", "x\nc\ny"))).toEqual([" x", "-a", "-b", "+c", " y"]);
  });

  it("finds moved lines by a longest common subsequence", () => {
    expect(signs(diffLines("a\nb\nc\nd", "b\nc\nd\na"))).toEqual(["-a", " b", " c", " d", "+a"]);
  });

  it("treats a missing side as empty", () => {
    expect(signs(diffLines(null, "new\ntext\n"))).toEqual(["+new", "+text"]);
    expect(signs(diffLines("gone\n", null))).toEqual(["-gone"]);
    expect(diffLines(null, null)).toEqual([]);
  });

  it("ignores the kind of line end", () => {
    expect(signs(diffLines("a\r\nb\r\n", "a\nb\n"))).toEqual([" a", " b"]);
  });

  it("counts what changed", () => {
    expect(countChanges(diffLines("a\nb\nc", "a\nB\nc\nd"))).toEqual({ added: 2, removed: 1 });
  });
});

describe("pairRows", () => {
  it("pairs removals with the additions after them, line by line", () => {
    const rows = pairRows(diffLines("keep\nold 1\nold 2\nold 3\nend", "keep\nnew 1\nend"));
    expect(rows.map((r) => [r.left?.text ?? null, r.right?.text ?? null])).toEqual([
      ["keep", "keep"],
      ["old 1", "new 1"],
      ["old 2", null],
      ["old 3", null],
      ["end", "end"],
    ]);
    expect(rows.map(rowChanged)).toEqual([false, true, true, true, false]);
  });

  it("pairs lines the same way for the unified view", () => {
    const lines = diffLines("keep\nold 1\nold 2\nend", "keep\nnew 1\nend\nextra");
    expect(signs(lines)).toEqual([" keep", "-old 1", "-old 2", "+new 1", " end", "+extra"]);
    expect(partners(lines)).toEqual([null, 3, null, 1, null, null]);
  });

  it("keeps each side's own line numbers", () => {
    const rows = pairRows(diffLines("a\nb", "new\na\nb"));
    expect(rows.map((r) => [r.left?.line ?? null, r.right?.line ?? null])).toEqual([
      [null, 1],
      [1, 2],
      [2, 3],
    ]);
  });
});

describe("foldUnchanged", () => {
  const changed = (n: number) => n === 1;

  it("keeps context around changes and folds long unchanged runs", () => {
    const items = Array.from({ length: 20 }, (_, i) => (i === 10 ? 1 : 0));
    expect(shape(foldUnchanged(items, changed, 2))).toEqual(["~8", "8", "9", "10", "11", "12", "~7"]);
  });

  it("leaves short runs open", () => {
    const items = [1, 0, 0, 0, 0, 0, 0, 1];
    // Two lines between the context windows are not worth a fold.
    expect(shape(foldUnchanged(items, changed, 2))).toEqual(["0", "1", "2", "3", "4", "5", "6", "7"]);
    expect(shape(foldUnchanged([1, 0, 0, 0, 0, 0, 0, 0, 0, 1], changed, 2))).toEqual(["0", "1", "2", "~4", "7", "8", "9"]);
  });

  it("folds everything when nothing changed", () => {
    expect(shape(foldUnchanged([0, 0, 0, 0], changed, 3))).toEqual(["~4"]);
    expect(shape(foldUnchanged([0, 0], changed, 3))).toEqual(["0", "1"]);
  });

  it("tells a fold where its items start", () => {
    const pieces = foldUnchanged([1, 0, 0, 0, 0, 0], changed, 1);
    expect(pieces[2]).toEqual({ fold: true, start: 2, count: 4 });
  });
});

describe("changedSpan", () => {
  const parts = (a: string, b: string) => {
    const span = changedSpan(a, b);
    return span && [a.slice(span.start, span.endA), b.slice(span.start, span.endB)];
  };

  it("marks the changed words of a line", () => {
    expect(parts("We match photos by date first.", "We match photos by timestamp first.")).toEqual(["date", "timestamp"]);
    expect(parts("fall back to hashes when dates collide", "fall back to hash when dates collide")).toEqual(["hashes", "hash"]);
    expect(parts("The cat sat.", "The dog sat.")).toEqual(["cat", "dog"]);
  });

  it("marks an insertion as an empty span on the old side", () => {
    expect(parts("One idea per card.", "One small idea per card.")).toEqual(["", "small "]);
  });

  it("gives up when the lines share too little", () => {
    expect(changedSpan("cat", "dog")).toBeNull();
    expect(changedSpan("same", "same")).toBeNull();
    // Only "1. " in common: marking the rest would mark nearly all of it.
    expect(changedSpan("1. How do we score a moved wall?", "1. Score a moved wall by its displacement.")).toBeNull();
  });

  it("never splits a surrogate pair", () => {
    const span = changedSpan("Plan 🙂 today", "Plan 🙃 today");
    expect(span).not.toBeNull();
    expect("Plan 🙂 today".slice(span!.start, span!.endA)).toBe("🙂");
  });
});
