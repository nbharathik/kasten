import { describe, expect, it } from "vitest";

import { sourceOf } from "./source-of";

describe("a highlight card's source", () => {
  it("is read from the flow form the core writes", () => {
    const front = "---\nid: 01K\ntitle: A note should…\ntype: highlight\nsource: {file: sources/primer.pdf, page: 2, highlight: 01K5ZK}\n---\n";
    expect(sourceOf(front)).toEqual({ source: "sources/primer.pdf", page: 2, highlight: "01K5ZK" });
  });

  it("is read from a block form, quotes and all", () => {
    const front = "---\ntype: highlight\nsource:\n  file: \"sources/a b.pdf\"\n  page: 7\ntags: [x]\n---\n";
    expect(sourceOf(front)).toEqual({ source: "sources/a b.pdf", page: 7 });
  });

  it("is read with the quotes the core puts round an odd file name", () => {
    const front = '---\ntype: highlight\nsource: {file: "sources/My paper (v2), draft {final} #3.pdf", page: 3, highlight: 01K5ZK}\n---\n';
    expect(sourceOf(front)).toEqual({ source: "sources/My paper (v2), draft {final} #3.pdf", page: 3, highlight: "01K5ZK" });
  });

  it("is nothing for other notes, or a file outside sources/", () => {
    expect(sourceOf("---\ntitle: Plain\n---\n")).toBeNull();
    expect(sourceOf("---\nsource: {file: assets/x.pdf, page: 1}\n---\n")).toBeNull();
    expect(sourceOf("---\nsource: https://example.com\n---\n")).toBeNull();
  });
});
