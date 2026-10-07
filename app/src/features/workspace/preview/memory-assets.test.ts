// The preview keeps pictures as kasten-core does (crates/kasten-core/tests/core/asset_*.rs):
// the same bytes are one asset, each remembers where it came from, and where one is
// used is worked out by looking. The fixtures are the ones the core's tests read.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { imageRefs, deckImages } from "./memory-assets";
import { MemoryVault } from "./memory-vault";
import { pictureSize } from "./picture-size";
import { sha256Hex } from "./sha256";

const FIXTURES = join(import.meta.dirname, "../../../../../fixtures/assets");
const fixture = (name: string) => new Uint8Array(readFileSync(join(FIXTURES, name)));
const manifest = JSON.parse(readFileSync(join(FIXTURES, "manifest.json"), "utf8")) as Record<string, { sha256: string; bytes: number; width: number; height: number }>;
const text = (s: string) => new TextEncoder().encode(s);

describe("hashes and sizes agree with the core's", () => {
  it("hashes the NIST vectors and every fixture as the manifest (made by hashlib) says", () => {
    expect(sha256Hex(text(""))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex(text("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex(text("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
    expect(sha256Hex(new Uint8Array(1_000_000).fill(97))).toBe("cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0");
    for (const [name, want] of Object.entries(manifest)) {
      const bytes = fixture(name);
      expect(bytes.length, name).toBe(want.bytes);
      expect(sha256Hex(bytes), name).toBe(want.sha256);
      expect(pictureSize(bytes), name).toEqual({ w: want.width, h: want.height });
    }
    expect(pictureSize(text("\u0089PNG fake image bytes"))).toBeNull();
    expect(pictureSize(text("not a picture"))).toBeNull();
  });
});

describe("the asset store in the preview", () => {
  it("keeps a picture with what a sidecar remembers, and the same bytes again are the same asset", async () => {
    const vault = new MemoryVault({});
    const first = await vault.addAsset("Pasted image 1.png", fixture("pixel.png"), { source: "pasted" });
    expect(first).toMatchObject({ path: "assets/pasted-image-1.png", created: true });
    expect(first.asset).toMatchObject({ name: "Pasted image 1.png", sha256: manifest["pixel.png"]!.sha256, width: 4, height: 3, source: "pasted", createdBy: "person", tags: [], described: true });
    expect(first.asset.id).toHaveLength(26);
    const second = await vault.addAsset("Pasted image 2.png", fixture("pixel.png"), { source: "pasted" });
    expect(second).toMatchObject({ path: first.path, created: false });
    expect(second.asset.id).toBe(first.asset.id);
    expect(await vault.assets()).toHaveLength(1);
    // Other bytes under a taken name take the next free one.
    expect((await vault.addAsset("Pasted image 1.png", fixture("wide.png"))).path).toBe("assets/pasted-image-1-2.png");
    expect(await vault.saveAsset("b.jpg", fixture("photo.jpg"))).toBe("assets/b.jpg");
  });

  it("lists pictures newest first and keeps the rules of the core", async () => {
    const vault = new MemoryVault({});
    await vault.saveAsset("Trip budget.xlsx", text("sheet"));
    await vault.addAsset("logo.svg", fixture("logo.svg"));
    const listed = await vault.assets();
    expect(listed.map((a) => a.path)).toEqual(["assets/logo.svg"]);
    expect(listed[0]).toMatchObject({ width: 120, height: 60 });
    for (const name of ["setup.exe", "page.html", "run.sh", "no-extension", ".png"]) await expect(vault.saveAsset(name, text("x"))).rejects.toThrow();
    await expect(vault.addAsset("x.png", text("x"), { source: "agent" })).rejects.toThrow(/agent/);
    await expect(vault.addAsset("x.png", text("x"), { source: "pdf-clip" })).rejects.toThrow(/paper/);
    await expect(vault.addAsset("x.png", text("x"), { clip: { pdf: "sources/a.pdf", page: 1, rect: [0, 0, 1, 1] } })).rejects.toThrow(/clip/);
  });

  it("changes tags, caption and citation key as the core tidies them", async () => {
    const vault = new MemoryVault({});
    const { path } = await vault.addAsset("fig.png", fixture("wide.png"));
    const info = await vault.setAssetMeta(path, { tags: ["Figure", " #Attention ", "figure", ""], caption: "  Scaled dot-product attention.\n", citationKey: "vaswani2017attention" });
    expect(info).toMatchObject({ tags: ["Figure", "Attention"], caption: "Scaled dot-product attention.", citationKey: "vaswani2017attention" });
    expect(await vault.asset(path)).toEqual(info);
    expect(await vault.setAssetMeta(path, { caption: "", citationKey: "" })).toMatchObject({ caption: null, citationKey: null, tags: ["Figure", "Attention"] });
    for (const edit of [{ tags: Array.from({ length: 40 }, (_, n) => `t${n}`) }, { caption: "c".repeat(2001) }, { citationKey: "two words" }, { citationKey: "a,b" }]) {
      await expect(vault.setAssetMeta(path, edit)).rejects.toThrow();
    }
    await expect(vault.asset("assets/none.png")).rejects.toThrow();
  });

  it("carries the paper, page and rectangle of a clip", async () => {
    const vault = new MemoryVault({});
    const clip = { pdf: "sources/zettelkasten-primer.pdf", page: 2, rect: [72, 300.5, 400, 520.25] as [number, number, number, number] };
    const added = await vault.addAsset("Figure 2.png", fixture("wide.png"), { source: "pdf-clip", clip, citationKey: "luhmann1992" });
    expect(added.asset).toMatchObject({ source: "pdf-clip", clip, citationKey: "luhmann1992" });
    await expect(vault.addAsset("y.png", fixture("pixel.png"), { source: "pdf-clip", clip: { ...clip, page: 0 } })).rejects.toThrow();
    expect(await vault.assetThumb(added.path, 256)).toBeUndefined();
  });
});

describe("where a picture is used, in the preview", () => {
  it("reads notes as the core does: links, embeds and img tags, not code or the web", () => {
    const body = "![a](../assets/one.png) ![b](../assets/two.png \"T\") ![[three.png]] <img src='../assets/four.png'>\n```\n![no](../assets/no.png)\n```\n`![no](../assets/no.png)` ![web](https://x.org/assets/no.png) [link](../assets/no.png)\n";
    expect(imageRefs("inbox/a.md", body)).toEqual({ paths: ["assets/one.png", "assets/two.png", "assets/four.png"], names: ["three.png"] });
  });

  it("reads a deck's pictures by slide and its theme's", () => {
    const deck = JSON.stringify({
      format: "kasten-deck",
      theme: { master: [{ type: "image", src: "assets/logo.png" }] },
      slides: [{ id: "s-1", elements: [] }, { id: "s-2", background: { image: "assets/bg.png" }, elements: [{ type: "group", children: [{ type: "image", src: "assets/a.png" }] }, { type: "video", src: "assets/clip.mp4", poster: "assets/poster.png" }] }],
    });
    const found = deckImages(deck)!;
    expect(found.slides.map(([id, paths]) => [id, [...paths].sort()])).toEqual([["s-1", []], ["s-2", ["assets/a.png", "assets/bg.png", "assets/poster.png"]]]);
    expect([...found.theme]).toEqual(["assets/logo.png"]);
    expect(deckImages("nope")).toBeNull();
  });

  it("finds the notes, boards and decks that show a picture, with one scan for all and one call for one", async () => {
    const deck = JSON.stringify({ format: "kasten-deck", formatVersion: 1, title: "Lecture", theme: { master: [{ type: "image", src: "assets/wide.png" }] }, slides: [{ id: "s-1", elements: [] }, { id: "s-2", elements: [{ type: "image", src: "assets/wide.png" }] }] });
    const board = JSON.stringify({ nodes: [{ id: "n1", type: "file", file: "assets/wide.png" }], edges: [], "x-kasten": { title: "Figures" } });
    const vault = new MemoryVault({
      "inbox/plain.md": "---\ntitle: Plain\n---\nSee ![a figure](../assets/wide.png) here.\n",
      "library/embed.md": "Above ![[wide.png]] and ![[assets/wide.png|300]]\n",
      "library/code.md": "```\n![x](../assets/wide.png)\n```\n",
      "library/lecture.deck": deck,
      "library/figures.canvas": board,
    });
    const { path } = await vault.addAsset("wide.png", fixture("wide.png"));
    const unused = (await vault.addAsset("unused.png", fixture("pixel.png"))).path;
    const usage = await vault.assetUsage(path);
    expect(usage.notes.map((n) => [n.path, n.title])).toEqual([["inbox/plain.md", "Plain"], ["library/embed.md", expect.any(String)]]);
    expect(usage.boards).toEqual([{ path: "library/figures.canvas", title: "Figures" }]);
    expect(usage.decks).toEqual([{ path: "library/lecture.deck", title: "Lecture", slides: [{ number: 2, id: "s-2" }], theme: true }]);
    const all = await vault.assetsUsage();
    expect(all[path]).toEqual(usage);
    expect(all[unused]).toBeUndefined();
    expect(await vault.assetUsage(unused)).toEqual({ notes: [], boards: [], decks: [] });
    await expect(vault.assetUsage("notes/welcome.md")).rejects.toThrow();
  });
});
