import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { DeckEngine, loadSlides } from "@kasten-slides/wasm";
import { beforeAll, describe, expect, it } from "vitest";

import type { DeckFile, FolderApi, Saved } from "./api.ts";
import { importDeck, titleOf } from "./import-deck.ts";

beforeAll(async () => {
  await loadSlides(await readFile(join(import.meta.dirname, "../../slides-wasm/pkg/slides_wasm_bg.wasm")));
});

/** A real PNG, 3 by 2 pixels. */
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00, 0x02, 0x08, 0x02, 0x00, 0x00, 0x00, 0x12, 0x16, 0xf1, 0x4d, 0x00, 0x00, 0x00, 0x15, 0x49, 0x44, 0x41,
  0x54, 0x78, 0xda, 0x63, 0x94, 0xab, 0x38, 0xc1, 0xc0, 0xc0, 0xc0, 0xc0, 0xc0, 0xc0, 0xc4, 0x00, 0x03, 0x00, 0x18, 0x2e, 0x01, 0x62, 0x87, 0x96, 0x3e, 0xbf, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

function talk(): File {
  const engine = DeckEngine.create("Lecture", "Serif", 3);
  const slide = engine.apply("add_slide", { layout: "blank" }).output.slide;
  engine.apply("add_elements", { slide, elements: [{ type: "image", id: "e-pic", x: 10, y: 10, w: 200, h: 100, src: "assets/pic.png" }] });
  const bytes = engine.exportPptx(new Map([["assets/pic.png", PNG]])).bytes;
  return new File([bytes as BlobPart], "Lecture_4.pptx");
}

/** A folder that records what it is asked. */
function folder(conflict = false) {
  const saved: { path: string; text: string; base: string }[] = [];
  const assets: string[] = [];
  const api = {
    addAsset: async (name: string) => {
      assets.push(name);
      return `assets/${name}`;
    },
    create: async (title: string): Promise<DeckFile> => ({ path: `${title}.deck`, text: "{}", hash: "h1", modified: 1 }),
    save: async (path: string, text: string, base: string): Promise<Saved> => {
      saved.push({ path, text, base });
      const deck = { path, text, hash: "h2", modified: 2 };
      return conflict ? { status: "conflict", copy: "copy.deck", deck } : { status: "written", deck };
    },
  } as unknown as FolderApi;
  return { api, saved, assets };
}

describe("a deck from a PowerPoint file, in the folder", () => {
  it("is named for the deck the file holds, keeps the pictures and is filled with the text the import made", async () => {
    const { api, saved, assets } = folder();
    const made = await importDeck(api, talk(), "Light");
    expect(made.deck.path).toBe("Lecture.deck");
    expect(made).toMatchObject({ slides: 2, kept: 0 });
    expect(assets).toHaveLength(1);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ path: "Lecture.deck", base: "h1" });
    const deck = DeckEngine.open(saved[0]?.text ?? "").deck;
    expect(deck.title).toBe("Lecture");
    const image = deck.slides[1]?.elements.find((e) => e.type === "image");
    expect(image?.type === "image" && image.src).toBe(`assets/${assets[0] ?? ""}`);
  });

  it("says when the new deck changed under it, and when the file is not a presentation", async () => {
    await expect(importDeck(folder(true).api, talk(), "Light")).rejects.toThrow(/copy\.deck/);
    await expect(importDeck(folder().api, new File(["words"], "notes.pptx"), "Light")).rejects.toThrow();
  });

  it("names the deck for the file", () => {
    expect(titleOf({ name: "Q3_review.PPTX" })).toBe("Q3 review");
    expect(titleOf({ name: ".pptx" })).toBe("Imported presentation");
  });
});
