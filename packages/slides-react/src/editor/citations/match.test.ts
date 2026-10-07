import type { Reference } from "@kasten-slides/wasm";
import { describe, expect, it } from "vitest";

import { matchReferences } from "./match.ts";

const work = (key: string, title: string, authors: string[], year: string, venue?: string): Reference =>
  ({ key, kind: "article", title, authors, year, ...(venue ? { venue } : {}), short: "", full: "" }) as Reference;

const WORKS = [
  work("vaswani2017attention", "Attention is all you need", ["Ashish Vaswani", "Noam Shazeer"], "2017", "Advances in Neural Information Processing Systems"),
  work("devlin2019bert", "BERT: Pre-training of Deep Bidirectional Transformers", ["Jacob Devlin", "Ming-Wei Chang"], "2019", "NAACL"),
  work("bahdanau2015attention", "Neural machine translation by jointly learning to align and translate", ["Dzmitry Bahdanau"], "2015", "ICLR"),
  work("lecun2015deep", "Deep learning", ["Yann LeCun", "Yoshua Bengio"], "2015", "Nature"),
];

const keys = (list: readonly Reference[]) => list.map((w) => w.key);

describe("finding a work", () => {
  it("lists everything, in the order written, when nothing is typed", () => {
    expect(keys(matchReferences(WORKS, ""))).toEqual(keys(WORKS));
    expect(keys(matchReferences(WORKS, "   "))).toEqual(keys(WORKS));
  });

  it("finds a work by its key, an author, a word of the title, the year or the venue", () => {
    expect(keys(matchReferences(WORKS, "devlin2019"))).toEqual(["devlin2019bert"]);
    expect(keys(matchReferences(WORKS, "shazeer"))).toEqual(["vaswani2017attention"]);
    expect(keys(matchReferences(WORKS, "transformers"))).toEqual(["devlin2019bert"]);
    expect(keys(matchReferences(WORKS, "2015"))).toEqual(["bahdanau2015attention", "lecun2015deep"]);
    expect(keys(matchReferences(WORKS, "nature"))).toEqual(["lecun2015deep"]);
  });

  it("wants every word, in any order, and ignores case and punctuation", () => {
    expect(keys(matchReferences(WORKS, "Bengio LeCun"))).toEqual(["lecun2015deep"]);
    expect(keys(matchReferences(WORKS, "ming-wei bert"))).toEqual(["devlin2019bert"]);
    expect(keys(matchReferences(WORKS, "attention 2015"))).toEqual(["bahdanau2015attention"]);
    expect(matchReferences(WORKS, "attention nobody")).toEqual([]);
  });

  it("puts the works whose key starts with what was typed first, then those whose key holds it, then the title", () => {
    expect(keys(matchReferences(WORKS, "attention"))).toEqual(["vaswani2017attention", "bahdanau2015attention"]);
    const more = [...WORKS, work("attention", "A key that is the word", ["A B"], "2000")];
    expect(keys(matchReferences(more, "attention"))[0]).toBe("attention");
  });
});
