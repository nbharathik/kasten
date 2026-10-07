import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { AssetInfo } from "../../../../lib/vault/asset-types";
import type { PdfRect } from "../../../../lib/vault/types";
import { MemoryVault } from "../../../workspace/preview/memory-vault";
import { readWorks } from "./bib";
import { clipName, keyProblem, saveClip, suggestKey } from "./clip-file";

const FIXTURES = join(import.meta.dirname, "../../../../../../fixtures");
const fixture = (name: string) => new Uint8Array(readFileSync(join(FIXTURES, "assets", name)));

const PDF = "sources/paper-with-figures.pdf";
const RECT: PdfRect = [72, 480, 300, 690];

const at = (path: string) => ({ path });

describe("naming a clip", () => {
  it("is the paper, the page and a number, starting at 1", () => {
    expect(clipName(PDF, 2, [])).toBe("paper-with-figures-p2-1.png");
    expect(clipName(PDF, 12, [at("assets/other.png")])).toBe("paper-with-figures-p12-1.png");
  });

  it("goes on from the highest number the page already has", () => {
    const held = [at("assets/paper-with-figures-p2-1.png"), at("assets/paper-with-figures-p2-3.png"), at("assets/paper-with-figures-p1-1.png"), at("assets/other-p2-9.png"), at("assets/paper-with-figures-p2-4.jpg")];
    expect(clipName(PDF, 2, held)).toBe("paper-with-figures-p2-4.png");
    expect(clipName(PDF, 1, held)).toBe("paper-with-figures-p1-2.png");
    expect(clipName(PDF, 3, held)).toBe("paper-with-figures-p3-1.png");
  });

  it("is a slug of the paper's file name", () => {
    expect(clipName("sources/My Paper (v2).pdf", 1, [])).toBe("my-paper-v2-p1-1.png");
    expect(clipName("sources/deep/Ünïcode.PDF", 1, [])).toBe("ünïcode-p1-1.png");
    expect(clipName("sources/---.pdf", 1, [])).toBe("figure-p1-1.png");
  });
});

describe("a citation key for a clip", () => {
  it("is one word: no spaces, commas, braces, quotes or backslashes", () => {
    expect(keyProblem("")).toBeNull();
    expect(keyProblem("vaswani2017attention")).toBeNull();
    expect(keyProblem("doe:2020_a-b.c")).toBeNull();
    for (const bad of ["two words", "a,b", "a{b", "a}b", 'a"b', "a\\b"]) expect(keyProblem(bad), bad).toMatch(/spaces, commas, braces, quotes or backslashes/);
    expect(keyProblem("k".repeat(129))).toMatch(/128/);
    expect(keyProblem("k".repeat(128))).toBeNull();
  });
});

describe("suggesting the key of a paper", () => {
  const works = readWorks("@article{vaswani2017attention, title={Attention is {All} you need}}\n@article{other, title={Other}}");
  const clipped = (key: string | null, added: number, from = PDF): AssetInfo => ({ path: `assets/${added}.png`, added, citationKey: key, clip: { pdf: from, page: 1, rect: RECT } }) as AssetInfo;

  it("is the key the latest clip from the same paper was given", () => {
    const held = [clipped("older", 1), clipped("newest", 3), clipped("middle", 2), clipped("another", 9, "sources/other.pdf")];
    expect(suggestKey(PDF, "Attention Is All You Need", held, works)).toBe("newest");
  });

  it("skips clips that were given no key", () => {
    expect(suggestKey(PDF, "", [clipped(null, 5), clipped("kept", 2)], works)).toBe("kept");
  });

  it("is the key of the work whose title is the paper's, when nothing was clipped from it yet", () => {
    expect(suggestKey(PDF, "Attention is all you need", [], works)).toBe("vaswani2017attention");
    expect(suggestKey(PDF, "ATTENTION IS ALL YOU NEED.", [], works)).toBe("vaswani2017attention");
  });

  it("is nothing when there is nothing to go on", () => {
    expect(suggestKey(PDF, "A paper nobody wrote", [], works)).toBe("");
    expect(suggestKey(PDF, "", [], works)).toBe("");
    expect(suggestKey(PDF, "Other", [], [])).toBe("");
  });
});

describe("keeping a clip in the vault", () => {
  it("stores the picture with the paper, page, rectangle, key and caption", async () => {
    const vault = new MemoryVault({});
    const added = await saveClip(vault, { pdf: PDF, page: 2, rect: RECT, png: fixture("wide.png"), key: "sample2026figures", caption: " Accuracy by model size. " });
    expect(added.created).toBe(true);
    expect(added.path).toBe("assets/paper-with-figures-p2-1.png");
    expect(added.asset).toMatchObject({ source: "pdf-clip", citationKey: "sample2026figures", caption: "Accuracy by model size.", clip: { pdf: PDF, page: 2, rect: RECT }, paper: "paper-with-figures" });
    expect((await vault.assets()).map((a) => a.path)).toEqual([added.path]);
  });

  it("numbers the next clip from the same page after the first", async () => {
    const vault = new MemoryVault({});
    await saveClip(vault, { pdf: PDF, page: 2, rect: RECT, png: fixture("wide.png"), key: "", caption: "" });
    const second = await saveClip(vault, { pdf: PDF, page: 2, rect: [320, 480, 523, 690], png: fixture("pixel.png"), key: "", caption: "" });
    expect(second.path).toBe("assets/paper-with-figures-p2-2.png");
    // Without a key or a caption, it has neither.
    expect(second.asset).toMatchObject({ citationKey: null, caption: null });
  });

  it("finds the same picture again as the same asset", async () => {
    const vault = new MemoryVault({});
    const first = await saveClip(vault, { pdf: PDF, page: 2, rect: RECT, png: fixture("wide.png"), key: "k", caption: "" });
    const again = await saveClip(vault, { pdf: PDF, page: 2, rect: RECT, png: fixture("wide.png"), key: "k", caption: "" });
    expect(again).toMatchObject({ created: false, path: first.path });
    expect(await vault.assets()).toHaveLength(1);
  });

  it("does not keep a key the vault would refuse", async () => {
    const vault = new MemoryVault({});
    await expect(saveClip(vault, { pdf: PDF, page: 1, rect: RECT, png: fixture("wide.png"), key: "two words", caption: "" })).rejects.toThrow(/spaces, commas/);
    expect(await vault.assets()).toEqual([]);
  });
});
