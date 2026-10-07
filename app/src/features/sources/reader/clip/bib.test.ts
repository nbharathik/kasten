import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { cite, matchWorks, readWorks, type Work } from "./bib";

const VAULT = join(import.meta.dirname, "../../../../../../fixtures/dev-vault");
const read = (path: string) => readFileSync(join(VAULT, path), "utf8");

const keys = (works: readonly Work[]) => works.map((w) => w.key);

describe("reading a bibliography", () => {
  const works = readWorks(read("references.bib"));

  it("finds the works of the dev vault's file, in the order they are written", () => {
    expect(keys(works)).toEqual(["vaswani2017attention", "devlin2019bert", "he2016resnet", "brown2020language", "lecun2015deep", "goodfellow2016deep"]);
  });

  it("takes the title, authors, year and where it appeared, without braces", () => {
    expect(works[1]).toEqual({
      key: "devlin2019bert",
      type: "inproceedings",
      title: "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
      authors: ["Devlin, Jacob", "Chang, Ming-Wei", "Lee, Kenton", "Toutanova, Kristina"],
      more: false,
      year: "2019",
      venue: "Proceedings of the 2019 Conference of the North American Chapter of the Association for Computational Linguistics: Human Language Technologies (NAACL-HLT)",
    });
  });

  it("knows an author list that goes on with others", () => {
    const brown = works.find((w) => w.key === "brown2020language")!;
    expect(brown.authors).toEqual(["Brown, Tom B.", "Mann, Benjamin", "Ryder, Nick", "Subbiah, Melanie", "Kaplan, Jared"]);
    expect(brown.more).toBe(true);
    expect(brown.venue).toBe("arXiv preprint arXiv:2005.14165");
  });

  it("reads the sample paper's own file", () => {
    const [paper] = readWorks(read("sources/paper-with-figures.bib"));
    expect(paper).toMatchObject({ key: "sample2026figures", type: "techreport", title: "A sample paper with three figures", authors: ["Sample, Kasten", "Vault, Dev"], year: "2026", venue: "Kasten dev vault" });
  });
});

describe("reading what is not tidy", () => {
  it("skips comments, strings and preambles, and lines that are not entries", () => {
    const text = `
% a comment line
@comment{@article{ghost, title={No}}}
@string{acm = "ACM"}
@preamble{"\\newcommand{\\noop}[1]{}"}
some words between the entries
@article{real, title = {Yes}, year = 2020}
`;
    expect(keys(readWorks(text))).toEqual(["real"]);
  });

  it("reads values in braces, in quotes, as numbers and as macros, joined with #", () => {
    const [w] = readWorks(`@article{k, title = "A {Quoted} title", author = "Doe, J." # " and Roe, R.", year = 2019, journal = jan}`);
    expect(w).toMatchObject({ key: "k", title: "A Quoted title", authors: ["Doe, J.", "Roe, R."], year: "2019", venue: "jan" });
  });

  it("takes entries in parentheses and on one line", () => {
    const works = readWorks(`@article(one, title={A}, year={2001}) @book{two, title={B}, year={2002}}`);
    expect(keys(works)).toEqual(["one", "two"]);
  });

  it("does not split an author's name in braces at its and", () => {
    const [w] = readWorks(`@misc{k, author = {{Barnes and Noble} and Smith, Ann}, title={T}}`);
    expect(w!.authors).toEqual(["Barnes and Noble", "Smith, Ann"]);
  });

  it("writes accents and special letters as the letters they are", () => {
    const [w] = readWorks(`@article{k, author = {Kaiser, {\\L}ukasz and Sch\\"{o}lkopf, Bernhard and Fern\\'andez, Jos\\'{e} and {\\O}stergaard, Ida}, title = {Na\\"ive \\& caf\\'e~au lait}}`);
    expect(w!.authors).toEqual(["Kaiser, Łukasz", "Schölkopf, Bernhard", "Fernández, José", "Østergaard, Ida"]);
    expect(w!.title).toBe("Naïve & café au lait");
  });

  it("takes the year from a date when there is no year", () => {
    expect(readWorks(`@misc{k, date = {2018-05-30}}`)[0]!.year).toBe("2018");
    expect(readWorks(`@misc{k, year = {n.d.}}`)[0]!.year).toBe("");
  });

  it("keeps a work whose end is missing, up to what was written", () => {
    const [w] = readWorks(`@article{cut, title = {Unfinished}, author = {Doe, J}, year = 2021`);
    expect(w).toMatchObject({ key: "cut", title: "Unfinished", year: "2021" });
  });

  it("takes the first of two works with the same key, as the readers of the vault do", () => {
    const works = readWorks(`@article{same, title={First}}\n@article{same, title={Second}}`);
    expect(works.map((w) => w.title)).toEqual(["First"]);
  });

  it("leaves out an entry without a key", () => {
    expect(readWorks(`@article{, title={No key}}\n@article{ok, title={Key}}`).map((w) => w.key)).toEqual(["ok"]);
  });
});

describe("reading what is hostile", () => {
  const started = () => performance.now();

  it("does not choke on a million open braces, or on a million starts of entries", () => {
    const t = started();
    expect(readWorks(`@article{x, title = ${"{".repeat(1_000_000)}`)).toHaveLength(1);
    expect(readWorks("@a{".repeat(500_000))).toEqual([]);
    expect(readWorks("@".repeat(2_000_000))).toEqual([]);
    expect(performance.now() - t).toBeLessThan(4000);
  });

  it("keeps one of a key written a thousand times, and never more than a bounded list of works", () => {
    expect(readWorks("@misc{k, title={T}}\n".repeat(1000))).toHaveLength(1);
    const numbered = Array.from({ length: 30_000 }, (_, i) => `@misc{k${i}, title={T}}`).join("\n");
    expect(readWorks(numbered)).toHaveLength(20_000);
  });

  it("copes with empty text and text without entries", () => {
    expect(readWorks("")).toEqual([]);
    expect(readWorks("nothing to see here @ all")).toEqual([]);
  });
});

describe("naming a work", () => {
  const works = readWorks(read("references.bib"));
  const by = (key: string) => works.find((w) => w.key === key)!;

  it("gives the surnames and the year, the way a short citation does: one, two, or the first and et al.", () => {
    expect(cite(by("vaswani2017attention"))).toBe("Vaswani et al., 2017");
    expect(cite(by("lecun2015deep"))).toBe("LeCun et al., 2015");
    expect(cite(readWorks(`@misc{k, author={Doe, Jane and Roe, Richard}, year=2020}`)[0]!)).toBe("Doe and Roe, 2020");
    expect(cite(readWorks(`@misc{k, author={Doe, Jane}, year=2020}`)[0]!)).toBe("Doe, 2020");
    expect(cite(by("brown2020language"))).toBe("Brown et al., 2020");
    expect(cite(readWorks(`@misc{k, title={T}}`)[0]!)).toBe("");
  });

  it("puts a first-last name's surname last", () => {
    expect(cite(readWorks(`@misc{k, author={Jane Doe and Richard Q. Roe}, year=2020}`)[0]!)).toBe("Doe and Roe, 2020");
  });
});

describe("finding a work by what is remembered of it", () => {
  const works = readWorks(read("references.bib"));

  it("lists every work, in order, when nothing is typed", () => {
    expect(keys(matchWorks(works, ""))).toEqual(keys(works));
    expect(keys(matchWorks(works, "   "))).toEqual(keys(works));
  });

  it("looks in the key, the authors, the title, the year and where it appeared", () => {
    expect(keys(matchWorks(works, "vaswani"))).toEqual(["vaswani2017attention"]);
    expect(keys(matchWorks(works, "bengio"))).toEqual(["lecun2015deep", "goodfellow2016deep"]);
    expect(keys(matchWorks(works, "residual"))).toEqual(["he2016resnet"]);
    expect(keys(matchWorks(works, "2016"))).toEqual(["he2016resnet", "goodfellow2016deep"]);
    expect(keys(matchWorks(works, "nature"))).toEqual(["lecun2015deep"]);
  });

  it("wants every word typed, whatever the order", () => {
    expect(keys(matchWorks(works, "deep bengio"))).toEqual(["lecun2015deep", "goodfellow2016deep"]);
    expect(keys(matchWorks(works, "deep learning bengio 2015"))).toEqual(["lecun2015deep"]);
    expect(matchWorks(works, "deep zebra")).toEqual([]);
  });

  it("puts works whose key begins with what was typed first, then those whose key holds it, then those whose title does", () => {
    expect(keys(matchWorks(works, "deep"))).toEqual(["lecun2015deep", "goodfellow2016deep", "devlin2019bert", "he2016resnet"]);
    expect(keys(matchWorks(works, "he2016"))).toEqual(["he2016resnet"]);
    const ranked = readWorks(`@misc{aaa, title={Zeta paper}}\n@misc{zeta1, title={Other}}`);
    expect(keys(matchWorks(ranked, "zeta"))).toEqual(["zeta1", "aaa"]);
  });
});
