// Making a deck from a PowerPoint file in the vault: the pictures kept, then the deck made.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { DeckEngine, loadSlides } from "@kasten-slides/wasm";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { VaultClient } from "../../lib/vault/types";
import { importDeck, summary, titleFor } from "./import-deck";

beforeAll(async () => {
  await loadSlides(await readFile(join(import.meta.dirname, "../../../../packages/slides-wasm/pkg/slides_wasm_bg.wasm")));
});

/** A real PNG, 3 by 2 pixels. */
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00, 0x02, 0x08, 0x02, 0x00, 0x00, 0x00, 0x12, 0x16, 0xf1, 0x4d, 0x00, 0x00, 0x00, 0x15, 0x49, 0x44, 0x41,
  0x54, 0x78, 0xda, 0x63, 0x94, 0xab, 0x38, 0xc1, 0xc0, 0xc0, 0xc0, 0xc0, 0xc0, 0xc0, 0xc4, 0x00, 0x03, 0x00, 0x18, 0x2e, 0x01, 0x62, 0x87, 0x96, 0x3e, 0xbf, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

function talk(): File {
  const engine = DeckEngine.create("Lecture", "Serif", 3);
  engine.apply("add_slide", { layout: "title-body", content: { title: "Results", body: "- one" } });
  const slide = engine.apply("add_slide", { layout: "blank" }).output.slide;
  engine.apply("add_elements", { slide, elements: [{ type: "image", id: "e-pic", x: 10, y: 10, w: 200, h: 100, src: "assets/pic.png" }] });
  const bytes = engine.exportPptx(new Map([["assets/pic.png", PNG]])).bytes;
  return new File([bytes as BlobPart], "Lecture_4.pptx");
}

function vault() {
  const made: { title: string; project: string | null; text: string }[] = [];
  const assets: { name: string; bytes: Uint8Array; meta: unknown }[] = [];
  const client = {
    addAsset: vi.fn(async (name: string, bytes: Uint8Array, meta?: unknown) => {
      assets.push({ name, bytes, meta });
      return { path: `assets/${assets.length}-${name}` };
    }),
    createDeck: vi.fn(async (title: string, project: string | null, text: string) => {
      made.push({ title, project, text });
      return "library/lecture-4.deck";
    }),
  } as unknown as VaultClient;
  return { client, made, assets };
}

describe("a deck from a PowerPoint file", () => {
  it("is named for the deck the file holds, keeps the pictures in the vault and names them as the vault does", async () => {
    const { client, made, assets } = vault();
    const done = await importDeck(client, talk(), "projects/talks");
    expect(done).toMatchObject({ path: "library/lecture-4.deck", title: "Lecture", slides: 3, pictures: 1, kept: 0, notes: 0 });
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({ meta: { source: "pptx-import", deck: "Lecture" } });
    expect(assets[0]?.bytes).toEqual(PNG);
    expect(made).toHaveLength(1);
    expect(made[0]?.project).toBe("projects/talks");
    const deck = DeckEngine.open(made[0]?.text ?? "").deck;
    expect(deck.title).toBe("Lecture");
    expect(deck.slides).toHaveLength(3);
    const image = deck.slides[2]?.elements.find((e) => e.type === "image");
    expect(image?.type === "image" && image.src).toBe(assets[0] ? `assets/1-${assets[0].name}` : "");
  });

  it("takes the title it is given over the file's own", async () => {
    const { client, made } = vault();
    await importDeck(client, talk(), null, "  Spring lecture ");
    expect(made[0]?.title).toBe("Spring lecture");
    expect(titleFor({ name: "x.pptx" })).toBe("x");
    expect(titleFor({ name: ".pptx" })).toBe("Imported presentation");
  });

  it("refuses a file that is not a presentation before it makes anything", async () => {
    const { client, made, assets } = vault();
    await expect(importDeck(client, new File(["not a zip"], "notes.pptx"), null)).rejects.toThrow();
    expect(made).toHaveLength(0);
    expect(assets).toHaveLength(0);
  });

  it("says what came over", () => {
    expect(summary({ path: "p", title: "Talk", slides: 9, pictures: 2, kept: 0, notes: 0 })).toBe("Imported “Talk”: 9 slides.");
    expect(summary({ path: "p", title: "Talk", slides: 1, pictures: 0, kept: 3, notes: 2 })).toContain("3 things were kept as pictures");
  });
});
