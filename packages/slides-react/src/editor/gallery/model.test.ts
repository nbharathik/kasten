import type { Deck } from "@kasten-slides/wasm";
import { describe, expect, it } from "vitest";

import type { HostImage, ImageUse } from "../host.ts";
import { RECENT_MS, type Narrowing, isUnused, matches, narrow, sizeLabel, sourceLine, usedIn, usesInDeck } from "./model.ts";

const NOW = 1_800_000_000_000;
const day = 24 * 60 * 60 * 1000;

const images: HostImage[] = [
  { path: "assets/attention.png", name: "Attention.png", added: NOW - 2 * day, source: "pdf-clip", paper: "Attention Is All You Need", tags: ["figure", "transformer"], caption: "Scaled dot-product attention", clip: { pdf: "sources/a.pdf", page: 3, rect: [0, 0, 1, 1] }, citationKey: "vaswani2017" },
  { path: "assets/chart.svg", name: "chart.svg", added: NOW - 40 * day, source: "agent", createdBy: "agent:01K5", tags: [] },
  { path: "assets/café.jpg", name: "Café à Paris.jpg", added: NOW - 100 * day, source: "file", tags: ["holiday"] },
  { path: "assets/pasted-image.png", name: "Pasted image 1.png", added: NOW - 1 * day, source: "pasted" },
];

const deck = (slides: unknown[], master: unknown[] = []): Deck => ({ slides, theme: { master, layouts: [] } }) as unknown as Deck;
const picture = (src: string) => ({ type: "image", id: "e", src });

const narrowing = (over: Partial<Narrowing> = {}): Narrowing => ({ query: "", filter: "all", deck: { slides: new Map(), theme: new Set() }, usage: null, now: NOW, ...over });

describe("searching", () => {
  it("looks in the name, tags, caption, paper, citation key and how it came in, ignoring case and accents", () => {
    const find = (query: string) => narrow(images, narrowing({ query })).map((i) => i.name);
    expect(find("attention")).toEqual(["Attention.png"]);
    expect(find("TRANSFORMER")).toEqual(["Attention.png"]);
    expect(find("dot-product")).toEqual(["Attention.png"]);
    expect(find("you need")).toEqual(["Attention.png"]);
    expect(find("vaswani")).toEqual(["Attention.png"]);
    expect(find("clipped")).toEqual(["Attention.png"]);
    expect(find("cafe a paris")).toEqual(["Café à Paris.jpg"]);
    expect(find("holiday")).toEqual(["Café à Paris.jpg"]);
    expect(find("agent")).toEqual(["chart.svg"]);
    expect(find("pasted")).toEqual(["Pasted image 1.png"]);
    expect(find("zebra")).toEqual([]);
    expect(find("  ")).toHaveLength(4);
  });

  it("wants every word", () => {
    expect(matches("figure holiday", images[0]!)).toBe(false);
    expect(matches("figure transformer", images[0]!)).toBe(true);
  });
});

describe("the filters", () => {
  const names = (filter: Narrowing["filter"], over: Partial<Narrowing> = {}) => narrow(images, narrowing({ filter, ...over })).map((i) => i.name);

  it("recent means the last two weeks", () => {
    expect(RECENT_MS).toBe(14 * day);
    expect(names("recent")).toEqual(["Attention.png", "Pasted image 1.png"]);
  });

  it("agent-made and from papers", () => {
    expect(names("agent")).toEqual(["chart.svg"]);
    expect(names("papers")).toEqual(["Attention.png"]);
  });

  it("this deck is what the open deck uses now, in its slides or its theme", () => {
    const open = usesInDeck(deck([{ id: "s1", elements: [picture("assets/chart.svg")] }, { id: "s2", elements: [] }], [picture("assets/café.jpg")]));
    expect(names("deck", { deck: open })).toEqual(["chart.svg", "Café à Paris.jpg"]);
  });

  it("unused is what nothing anywhere uses, and needs the host to say where things are used", () => {
    const usage: Record<string, ImageUse> = { "assets/attention.png": { notes: [{ path: "n.md", title: "N" }], boards: [], decks: [] }, "assets/chart.svg": { notes: [], boards: [], decks: [] } };
    const open = usesInDeck(deck([{ id: "s1", elements: [picture("assets/café.jpg")] }]));
    expect(names("unused", { usage, deck: open })).toEqual(["chart.svg", "Pasted image 1.png"]);
    expect(names("unused", { usage: null })).toEqual([]);
    expect(isUnused(images[3]!, { usage: {}, deck: open })).toBe(true);
    expect(isUnused(images[2]!, { usage: {}, deck: open })).toBe(false);
  });

  it("a search and a filter together", () => {
    expect(names("recent", { query: "pasted" })).toEqual(["Pasted image 1.png"]);
    expect(names("agent", { query: "pasted" })).toEqual([]);
  });
});

describe("where the open deck uses an image", () => {
  it("counts pictures in slides, groups, backgrounds, raw previews and posters, and the theme's master", () => {
    const open = usesInDeck(
      deck(
        [
          { id: "a", elements: [picture("assets/one.png"), { type: "group", id: "g", children: [picture("assets/two.png")] }] },
          { id: "b", background: { image: "assets/bg.png" }, elements: [picture("assets/one.png"), { type: "raw", id: "r", preview: "assets/raw.png" }, { type: "video", id: "v", src: "assets/clip.mp4", poster: "assets/poster.png" }, { type: "embed", id: "m", url: "https://x", poster: "assets/page.png" }, picture("")] },
        ],
        [picture("assets/logo.png")],
      ),
    );
    expect(open.slides.get("assets/one.png")).toEqual([{ number: 1, id: "a" }, { number: 2, id: "b" }]);
    expect([...open.slides.keys()].sort()).toEqual(["assets/bg.png", "assets/one.png", "assets/page.png", "assets/poster.png", "assets/raw.png", "assets/two.png"]);
    expect([...open.theme]).toEqual(["assets/logo.png"]);
  });

  it("lists the open deck from the editor's copy and the others from the host", () => {
    const open = usesInDeck(deck([{ id: "a", elements: [picture("assets/x.png")] }]));
    const usage: Record<string, ImageUse> = {
      "assets/x.png": {
        notes: [{ path: "n.md", title: "Notes" }],
        boards: [{ path: "b.canvas", title: "Board" }],
        decks: [{ path: "library/open.deck", title: "Open", slides: [{ number: 1, id: "a" }], theme: false }, { path: "library/other.deck", title: "Other", slides: [{ number: 4, id: "z" }], theme: false }],
      },
    };
    const used = usedIn({ path: "assets/x.png", name: "x.png" }, { deck: open, usage, deckPath: "library/open.deck" });
    expect(used.slides).toEqual([{ number: 1, id: "a" }]);
    expect(used.decks.map((d) => d.path)).toEqual(["library/other.deck"]);
    expect(used.count).toBe(4);
    expect(usedIn({ path: "assets/none.png", name: "none.png" }, { deck: open, usage, deckPath: undefined }).count).toBe(0);
  });
});

describe("words for people", () => {
  it("says how an image came in", () => {
    expect(sourceLine(images[0]!)).toBe("Clipped from Attention Is All You Need, page 3");
    expect(sourceLine(images[1]!)).toBe("Made by an agent");
    expect(sourceLine(images[3]!)).toBe("Pasted");
    expect(sourceLine({ path: "p", name: "p", source: "pptx-import", deck: "Lecture 4" })).toBe("Imported from Lecture 4");
    expect(sourceLine({ path: "p", name: "p" })).toBe("");
  });

  it("sizes", () => {
    expect([sizeLabel(undefined), sizeLabel(500), sizeLabel(2048), sizeLabel(1.5 * 1024 * 1024)]).toEqual(["", "500 B", "2 KB", "1.5 MB"]);
  });
});
