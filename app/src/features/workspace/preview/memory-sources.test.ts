// The preview's sources behave like kasten-core's (tests/core/highlights.rs).

import { describe, expect, it } from "vitest";

import type { NewHighlight } from "../../../lib/vault/source-types";
import { MemoryVault } from "./memory-vault";
import type { PreviewStorage } from "./stored";

const NOW = Date.UTC(2026, 8, 24, 8, 0, 0);
const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n");
const SOURCE = "sources/attention-is-all-you-need.pdf";
const DAY = "2026-09-24";

const vault = (storage?: PreviewStorage) => new MemoryVault({}, storage, () => NOW);
const quote = (text: string, extra: Partial<NewHighlight> = {}): NewHighlight => ({ page: 3, rects: [[72, 512.25, 310.5, 524.75]], text, color: "yellow", ...extra });

function memory(): PreviewStorage & { value: string | null } {
  const store = { value: null as string | null, load: () => store.value, save: (data: string) => void (store.value = data) };
  return store;
}

describe("preview sources", () => {
  it("imports a PDF once, under its name, and lists it with its title", async () => {
    const v = vault();
    expect(await v.importSource("Attention Is All You Need.pdf", PDF)).toBe(SOURCE);
    expect(await v.importSource("Attention Is All You Need.pdf", PDF)).toBe(SOURCE);
    expect(await v.importSource("attention is all you need.PDF", new TextEncoder().encode("%PDF-1.4 other"))).toBe("sources/attention-is-all-you-need-2.pdf");
    expect((await v.sources()).map((s) => [s.path, s.title, s.highlights])).toEqual([
      [SOURCE, "Attention Is All You Need", 0],
      ["sources/attention-is-all-you-need-2.pdf", "attention is all you need", 0],
    ]);
    expect(await v.readSource(SOURCE)).toEqual(PDF);
    await expect(v.importSource("notes.pdf", new TextEncoder().encode("hello"))).rejects.toThrow("not a PDF");
    await expect(v.importSource("paper.docx", PDF)).rejects.toThrow("only PDFs");
  });

  it("adds, edits and removes highlights, and refuses what does not fit", async () => {
    const v = vault();
    await v.importSource("Attention Is All You Need.pdf", PDF);
    const added = await v.addHighlight(SOURCE, quote("Attention is all you need.", { rects: [[72, 498, 188.123, 510.5]] }));
    expect(added).toMatchObject({ page: 3, color: "yellow", created: "2026-09-24T08:00:00Z", card: null, rects: [[72, 498, 188.12, 510.5]] });
    const edited = await v.editHighlight(SOURCE, added.id, { color: "blue", comment: "The thesis." });
    expect([edited.color, edited.comment]).toEqual(["blue", "The thesis."]);
    expect((await v.editHighlight(SOURCE, added.id, { comment: " " })).comment).toBeNull();
    await expect(v.editHighlight(SOURCE, added.id, { color: "red" as never })).rejects.toThrow("not red");
    await expect(v.addHighlight(SOURCE, quote("x", { page: 0 }))).rejects.toThrow("from 1");
    await expect(v.addHighlight(SOURCE, quote("  "))).rejects.toThrow("needs the text");
    await expect(v.addHighlight("sources/missing.pdf", quote("x"))).rejects.toThrow("No source");
    expect((await v.sources())[0]!.highlights).toBe(1);
    await v.removeHighlight(SOURCE, added.id);
    expect(await v.highlights(SOURCE)).toEqual([]);
  });

  it("makes a highlight card that links back, once", async () => {
    const v = vault();
    await v.importSource("Attention Is All You Need.pdf", PDF);
    const h = await v.addHighlight(SOURCE, quote("We propose a new simple network architecture, the Transformer, based solely on attention mechanisms.", { comment: "The core claim." }));
    const card = await v.highlightCard(SOURCE, h.id, DAY);
    expect(card.meta.path).toBe("inbox/we-propose-a-new-simple-network-architecture-the.md");
    expect(card.meta.kind).toBe("highlight");
    expect(card.meta.title).toBe("We propose a new simple network architecture, the…");
    expect(card.text).toContain(`\nsource: {file: ${SOURCE}, page: 3, highlight: ${h.id}}\n`);
    expect(card.text.split("---\n")[2]).toBe(
      `> We propose a new simple network architecture, the Transformer, based solely on attention mechanisms.\n\nThe core claim.\n\n[Attention Is All You Need, page 3](../${SOURCE}#page=3&highlight=${h.id})\n`,
    );
    const [listed] = await v.highlights(SOURCE);
    expect([listed!.cardId, listed!.card]).toEqual([card.meta.id, card.meta.path]);
    expect((await v.highlightCard(SOURCE, h.id, DAY)).meta.path).toBe(card.meta.path);
    // Gone to the trash: the next ask makes a new one.
    await v.trash(card.meta.path);
    expect((await v.highlights(SOURCE))[0]!.card).toBeNull();
    expect((await v.highlightCard(SOURCE, h.id, DAY)).meta.id).not.toBe(card.meta.id);
  });

  it("links a card back to a PDF whatever its name, as the core does", async () => {
    const v = vault();
    const odd = "sources/My paper (v2), draft {final} #3.pdf";
    v.addSampleSource(odd, async () => PDF);
    const h = await v.addHighlight(odd, quote("Odd names too."));
    const card = await v.highlightCard(odd, h.id, DAY);
    expect(card.text).toContain(`\nsource: {file: "${odd}", page: 3, highlight: ${h.id}}\n`);
    expect(card.text.split("---\n")[2]).toBe(
      `> Odd names too.\n\n[My paper (v2), draft {final} #3, page 3](../sources/My%20paper%20%28v2%29,%20draft%20%7Bfinal%7D%20%233.pdf#page=3&highlight=${h.id})\n`,
    );
    expect(card.meta.kind).toBe("highlight");
  });

  it("keeps highlights over a reload, and a sample PDF loads when first read", async () => {
    const storage = memory();
    const v = vault(storage);
    v.addSampleSource("sources/primer.pdf", async () => PDF);
    const h = await v.addHighlight("sources/primer.pdf", quote("One idea per note."));
    const again = new MemoryVault({}, storage, () => NOW);
    again.addSampleSource("sources/primer.pdf", async () => PDF);
    expect((await again.highlights("sources/primer.pdf")).map((x) => x.id)).toEqual([h.id]);
    expect(await again.readSource("sources/primer.pdf")).toEqual(PDF);
    expect((await again.allHighlights()).map((s) => [s.source.title, s.highlights.length])).toEqual([["primer", 1]]);
  });

  it("starts from the sample sidecars in the seed", async () => {
    const sidecar = JSON.stringify({ title: "A primer", highlights: [{ id: "h1", page: 2, rects: [[1, 2, 3, 4]], text: "Old", color: "green", from: "zotero" }] });
    const v = new MemoryVault({ "sources/primer.highlights.json": sidecar }, undefined, () => NOW);
    v.addSampleSource("sources/primer.pdf", async () => PDF);
    expect((await v.sources())[0]).toMatchObject({ title: "A primer", highlights: 1 });
    await v.editHighlight("sources/primer.pdf", "h1", { color: "pink" });
    const [kept] = await v.highlights("sources/primer.pdf");
    expect(kept).toMatchObject({ id: "h1", color: "pink", text: "Old" });
  });
});
