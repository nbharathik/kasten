import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MemoryVault } from "../../../workspace/preview/memory-vault";
import { useWorkspace } from "../../../workspace/store";
import { PRIMER, sampleVault } from "../../test-kit";
import PdfReader from "../PdfReader";

// pdf.js stands in: two pages of a size the tests may change, with one line of text each.
const pdf = vi.hoisted(() => {
  const size = { width: 595, height: 842 };
  class TextLayer {
    constructor(private readonly options: { textContentSource: number; container: HTMLElement }) {}
    render() {
      const span = document.createElement("span");
      span.textContent = `Words of page ${this.options.textContentSource}.`;
      this.options.container.append(span);
      return Promise.resolve();
    }
    cancel() {}
  }
  const page = (n: number) => ({
    getViewport: ({ scale }: { scale: number }) => ({ width: size.width * scale, height: size.height * scale, transform: [scale, 0, 0, -scale, 0, size.height * scale] }),
    render: () => ({ promise: Promise.resolve(), cancel() {} }),
    streamTextContent: () => n,
    getTextContent: async () => ({ items: [] }),
    cleanup() {},
  });
  const openPdf = vi.fn(async (_bytes: Uint8Array) => ({
    numPages: 2,
    getPage: async (n: number) => page(n),
    getOutline: async () => null,
    loadingTask: { destroy: vi.fn(async () => {}) },
  }));
  return { size, openPdf, lib: { TextLayer } };
});
vi.mock("../../pdf/load", () => ({ openPdf: pdf.openPdf, pdfjs: async () => pdf.lib }));

// Cutting a figure out needs a canvas, which jsdom has not: the picture is a stored one (the real cut is checked in crop-render.test.ts).
const cut = vi.hoisted(() => ({ bytes: new Uint8Array(), cropPage: vi.fn() }));
vi.mock("./crop", async (original) => ({ ...(await original<typeof import("./crop")>()), cropPage: cut.cropPage }));

const FIXTURES = join(import.meta.dirname, "../../../../../../fixtures");
const BIB = readFileSync(join(FIXTURES, "dev-vault/references.bib"), "utf8");

/** Page n's top in the window: pages sit one under another, 18 px apart. */
const pageTop = (n: number) => (n - 1) * (pdf.size.height + 18);
const at = (n: number, x: number, y: number) => ({ clientX: x, clientY: pageTop(n) + y });

beforeEach(() => {
  localStorage.clear();
  pdf.size.width = 595;
  pdf.size.height = 842;
  cut.bytes = new Uint8Array(readFileSync(join(FIXTURES, "assets/wide.png")));
  cut.cropPage.mockReset();
  cut.cropPage.mockImplementation(async () => ({ bytes: cut.bytes, width: 417, height: 250 }));
  // jsdom lays nothing out: pages get their places, the rest is at 0.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const n = Number((this as HTMLElement).dataset?.page);
    const [top, width, height] = this.classList.contains("kasten-pdf-page") ? [pageTop(n), pdf.size.width, pdf.size.height] : [0, 0, 0];
    return { x: 0, y: top, left: 0, top, right: width, bottom: top + height, width, height, toJSON: () => ({}) } as DOMRect;
  });
  Element.prototype.scrollTo = vi.fn();
});
afterEach(() => {
  cleanup();
  window.getSelection()?.removeAllRanges();
  vi.restoreAllMocks();
});

async function open(seed: Record<string, string> = { "references.bib": BIB }) {
  const vault: MemoryVault = await sampleVault(seed);
  render(<PdfReader path={PRIMER} />);
  await screen.findByRole("region", { name: "Page 2" });
  await within(screen.getByRole("region", { name: "Page 2" })).findByText("Words of page 2.");
  const bar = screen.getByRole("button", { name: "Clip" });
  return { vault, bar };
}

/** Turns the tool on. */
async function clipping(seed?: Record<string, string>) {
  const kit = await open(seed);
  fireEvent.click(kit.bar);
  return { ...kit, layer: screen.getByRole("group", { name: "Clip a figure" }) };
}

const box = () => screen.queryByRole("group", { name: "Clip box" });
const style = (el: HTMLElement) => ({ left: parseFloat(el.style.left), top: parseFloat(el.style.top), width: parseFloat(el.style.width), height: parseFloat(el.style.height) });
const form = () => screen.queryByRole("dialog", { name: "Save this figure" });

/** A press at `from`, the pointer taken to `to` and let go, all on page n. The pointer stays over the element it pressed, as it does in a window. */
function drag(target: Element, n: number, from: [number, number], to: [number, number]) {
  fireEvent.pointerDown(target, { button: 0, buttons: 1, ...at(n, ...from) });
  fireEvent.pointerMove(target, { buttons: 1, ...at(n, ...to) });
  fireEvent.pointerUp(target, at(n, ...to));
}

describe("the clip tool's switch", () => {
  it("is in the bar beside the highlights, and turns the tool on and off", async () => {
    const { bar } = await open();
    expect(bar.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByRole("group", { name: "Clip a figure" })).toBeNull();
    fireEvent.click(bar);
    expect(bar.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("status").textContent).toMatch(/Drag a box around a figure/);
    fireEvent.click(bar);
    expect(bar.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByRole("group", { name: "Clip a figure" })).toBeNull();
  });

  it("puts away a selection that was waiting to become a highlight", async () => {
    const { bar } = await open();
    const words = within(screen.getByRole("region", { name: "Page 1" })).getByText("Words of page 1.");
    const range = document.createRange();
    range.selectNodeContents(words);
    window.getSelection()!.addRange(range);
    fireEvent.click(bar);
    expect(window.getSelection()!.isCollapsed).toBe(true);
  });

  it("is left with Escape when no box is drawn", async () => {
    const { bar } = await clipping();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(bar.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByRole("group", { name: "Clip a figure" })).toBeNull();
  });

  it("does not take an Escape typed into a field elsewhere", async () => {
    const { bar } = await clipping();
    const field = document.createElement("input");
    document.body.append(field);
    fireEvent.keyDown(field, { key: "Escape" });
    field.remove();
    expect(bar.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("drawing a box", () => {
  it("shows the box where it was drawn, on its page, and asks what to keep", async () => {
    const { layer } = await clipping();
    drag(layer, 2, [100, 200], [300, 260]);
    const drawn = box()!;
    expect(drawn).toBeTruthy();
    expect(screen.getByRole("region", { name: "Page 2" }).contains(drawn)).toBe(true);
    expect(style(drawn)).toEqual({ left: 100, top: 200, width: 200, height: 60 });
    // 200 by 60 points at 300 dots an inch.
    expect(within(form()!).getByText("833 × 250 px at 300 dpi")).toBeTruthy();
    expect(await within(form()!).findByText("A Zettelkasten primer")).toBeTruthy();
    expect(within(form()!).getByText("page 2")).toBeTruthy();
  });

  it("draws from any corner to the other", async () => {
    const { layer } = await clipping();
    drag(layer, 1, [300, 260], [100, 200]);
    expect(style(box()!)).toEqual({ left: 100, top: 200, width: 200, height: 60 });
  });

  it("stays on the page when the pointer leaves it", async () => {
    const { layer } = await clipping();
    drag(layer, 1, [500, 700], [900, 1200]);
    expect(style(box()!)).toEqual({ left: 500, top: 700, width: 95, height: 142 });
  });

  it("does not select text under the pointer", async () => {
    const { layer } = await clipping();
    // fireEvent says false when the press was cancelled, which is what keeps the browser from starting a selection.
    expect(fireEvent.pointerDown(layer, { button: 0, ...at(1, 50, 50) })).toBe(false);
    fireEvent.pointerUp(layer, at(1, 50, 50));
  });

  it("takes a click for no box, and puts an old box away", async () => {
    const { layer } = await clipping();
    drag(layer, 1, [100, 100], [104, 103]);
    expect(box()).toBeNull();
    drag(layer, 1, [100, 100], [300, 200]);
    expect(box()).toBeTruthy();
    drag(layer, 1, [400, 400], [401, 401]);
    expect(box()).toBeNull();
    expect(form()).toBeNull();
  });

  it("does nothing for a press between two pages", async () => {
    const { layer } = await clipping();
    // The gap between the pages: 842 to 860.
    fireEvent.pointerDown(layer, { button: 0, buttons: 1, clientX: 100, clientY: 850 });
    fireEvent.pointerMove(layer, { buttons: 1, clientX: 300, clientY: 700 });
    fireEvent.pointerUp(layer, { clientX: 300, clientY: 700 });
    expect(box()).toBeNull();
  });

  it("is put away by Escape, and Escape again leaves the tool", async () => {
    const { layer, bar } = await clipping();
    drag(layer, 1, [100, 100], [300, 200]);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(box()).toBeNull();
    expect(bar.getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(bar.getAttribute("aria-pressed")).toBe("false");
  });

  it("is put away by Escape typed in the form, which leaves the tool on", async () => {
    const { layer, bar } = await clipping();
    drag(layer, 1, [100, 100], [300, 200]);
    fireEvent.keyDown(within(form()!).getByRole("textbox", { name: "Caption" }), { key: "Escape" });
    expect(box()).toBeNull();
    expect(form()).toBeNull();
    expect(bar.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("changing the box", () => {
  it("moves when it is pressed inside and dragged, and stays on the page", async () => {
    const { layer } = await clipping();
    drag(layer, 1, [100, 200], [300, 260]);
    const inside = box()!;
    drag(inside, 1, [150, 230], [190, 210]);
    expect(style(box()!)).toEqual({ left: 140, top: 180, width: 200, height: 60 });
    drag(box()!, 1, [200, 200], [900, 900]);
    expect(style(box()!)).toEqual({ left: 395, top: 782, width: 200, height: 60 });
  });

  it("resizes by a handle: a corner moves two sides, a side one", async () => {
    const { layer } = await clipping();
    drag(layer, 1, [100, 200], [300, 260]);
    const handle = (name: string) => box()!.querySelector<HTMLElement>(`[data-handle="${name}"]`)!;
    drag(handle("se"), 1, [300, 260], [340, 300]);
    expect(style(box()!)).toEqual({ left: 100, top: 200, width: 240, height: 100 });
    drag(handle("w"), 1, [100, 250], [80, 250]);
    expect(style(box()!)).toEqual({ left: 80, top: 200, width: 260, height: 100 });
    drag(handle("n"), 1, [200, 200], [200, 150]);
    expect(style(box()!)).toEqual({ left: 80, top: 150, width: 260, height: 150 });
  });

  it("keeps the form's answers while it is changed, and shows its size again", async () => {
    const { layer } = await clipping();
    drag(layer, 1, [100, 200], [300, 260]);
    fireEvent.change(within(form()!).getByRole("textbox", { name: "Caption" }), { target: { value: "Attention" } });
    drag(box()!.querySelector<HTMLElement>('[data-handle="e"]')!, 1, [300, 230], [400, 230]);
    expect((within(form()!).getByRole("textbox", { name: "Caption" }) as HTMLInputElement).value).toBe("Attention");
    expect(within(form()!).getByText("1250 × 250 px at 300 dpi")).toBeTruthy();
  });

  it("leaves the handles on the sides off a box that is small", async () => {
    const { layer } = await clipping();
    drag(layer, 1, [100, 200], [130, 230]);
    expect(box()!.classList.contains("is-small")).toBe(true);
    drag(layer, 1, [100, 300], [300, 400]);
    expect(box()!.classList.contains("is-small")).toBe(false);
  });
});

describe("saving a figure", () => {
  const key = () => screen.getByRole("combobox", { name: "Citation key" }) as HTMLInputElement;
  const caption = () => screen.getByRole("textbox", { name: "Caption" }) as HTMLInputElement;
  const save = () => screen.getByRole("button", { name: "Save to gallery" });

  it("cuts the box out at 300 dpi and keeps it with its paper, page, rectangle, key and caption", async () => {
    const { layer, vault } = await clipping();
    const added = vi.spyOn(vault, "addAsset");
    drag(layer, 2, [100, 200], [300, 260]);
    fireEvent.change(key(), { target: { value: "vasw" } });
    fireEvent.click(within(await screen.findByRole("listbox")).getByRole("option", { name: /vaswani2017attention/ }));
    expect(key().value).toBe("vaswani2017attention");
    fireEvent.change(caption(), { target: { value: "  Scaled dot-product attention.  " } });
    await act(async () => fireEvent.click(save()));
    await vi.waitFor(() => expect(added).toHaveBeenCalledOnce());
    // The page is cut where the box is: 100 to 300 across, 842 - 260 to 842 - 200 up.
    const [page, rect] = cut.cropPage.mock.calls[0] as [unknown, number[]];
    expect(page).toBeTruthy();
    expect(rect.map((n) => Math.round(n * 100) / 100)).toEqual([100, 582, 300, 642]);
    expect(added).toHaveBeenCalledWith("zettelkasten-primer-p2-1.png", cut.bytes, {
      source: "pdf-clip",
      clip: { pdf: PRIMER, page: 2, rect: [100, 582, 300, 642] },
      citationKey: "vaswani2017attention",
      caption: "Scaled dot-product attention.",
    });
    const kept = await vault.assets();
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ path: "assets/zettelkasten-primer-p2-1.png", source: "pdf-clip", paper: "zettelkasten-primer" });
  });

  it("says so, puts the box away and stays ready for the next figure", async () => {
    const { layer, bar } = await clipping();
    drag(layer, 1, [100, 200], [300, 260]);
    await act(async () => fireEvent.click(save()));
    await vi.waitFor(() => expect(box()).toBeNull());
    expect(form()).toBeNull();
    expect(useWorkspace.getState().toasts.at(-1)?.text).toBe("Clipped to the gallery: assets/zettelkasten-primer-p1-1.png");
    expect(bar.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("status").textContent).toMatch(/Drag a box/);
  });

  it("starts the next figure from the same paper with the key of the last, and numbers the file after it", async () => {
    const { layer, vault } = await clipping();
    const added = vi.spyOn(vault, "addAsset");
    drag(layer, 1, [100, 200], [300, 260]);
    fireEvent.change(key(), { target: { value: "sample2026figures" } });
    await act(async () => fireEvent.click(save()));
    await vi.waitFor(() => expect(box()).toBeNull());
    cut.bytes = new Uint8Array(readFileSync(join(FIXTURES, "assets/pixel.png")));
    drag(layer, 1, [100, 400], [300, 500]);
    await vi.waitFor(() => expect(key().value).toBe("sample2026figures"));
    await act(async () => fireEvent.click(save()));
    await vi.waitFor(() => expect(added).toHaveBeenCalledTimes(2));
    expect(added.mock.calls[1]![0]).toBe("zettelkasten-primer-p1-2.png");
    expect(added.mock.calls[1]![2]).toMatchObject({ citationKey: "sample2026figures" });
  });

  it("keeps a figure without a key or a caption if none is given", async () => {
    const { layer, vault } = await clipping({});
    const added = vi.spyOn(vault, "addAsset");
    drag(layer, 1, [100, 200], [300, 260]);
    expect(screen.getByText(/No \.bib file in the vault yet/)).toBeTruthy();
    await act(async () => fireEvent.click(save()));
    await vi.waitFor(() => expect(added).toHaveBeenCalledOnce());
    expect(added.mock.calls[0]![2]).toEqual({ source: "pdf-clip", clip: { pdf: PRIMER, page: 1, rect: [100, 582, 300, 642] } });
  });

  it("says when the same figure was kept before", async () => {
    const { layer } = await clipping();
    drag(layer, 1, [100, 200], [300, 260]);
    await act(async () => fireEvent.click(save()));
    await vi.waitFor(() => expect(box()).toBeNull());
    drag(layer, 1, [100, 200], [300, 260]);
    await act(async () => fireEvent.click(save()));
    await vi.waitFor(() => expect(box()).toBeNull());
    expect(useWorkspace.getState().toasts.at(-1)?.text).toBe("That figure is already in the gallery: assets/zettelkasten-primer-p1-1.png");
  });

  it("keeps the box and says why when the figure could not be saved", async () => {
    const { layer, vault } = await clipping();
    vi.spyOn(vault, "addAsset").mockRejectedValueOnce(new Error("The vault is read only"));
    drag(layer, 1, [100, 200], [300, 260]);
    await act(async () => fireEvent.click(save()));
    await vi.waitFor(() => expect(useWorkspace.getState().toasts.at(-1)?.text).toBe("The figure could not be saved: The vault is read only"));
    expect(box()).toBeTruthy();
    expect(save().hasAttribute("disabled")).toBe(false);
  });

  it("does not save a key the vault would refuse", async () => {
    const { layer } = await clipping();
    drag(layer, 1, [100, 200], [300, 260]);
    fireEvent.change(key(), { target: { value: "two words" } });
    expect(screen.getByRole("alert").textContent).toMatch(/no spaces, commas, braces, quotes or backslashes/);
    expect(save().hasAttribute("disabled")).toBe(true);
    fireEvent.submit(form()!);
    expect(cut.cropPage).not.toHaveBeenCalled();
  });

  it("refuses a box too big to make into a picture, and says so", async () => {
    pdf.size.width = 6000;
    pdf.size.height = 6000;
    const { layer } = await clipping();
    drag(layer, 1, [0, 0], [3000, 3000]);
    expect(within(form()!).getByRole("alert").textContent).toMatch(/megapixels at 300 dpi and the most is 60/);
    expect(save().hasAttribute("disabled")).toBe(true);
  });
});

describe("choosing the key", () => {
  it("starts from the work whose title is the paper's when the vault has one", async () => {
    const seed = { "sources/primer.bib": "@article{luhmann1981, title={A Zettelkasten primer}, author={Luhmann, Niklas}, year={1981}}" };
    const { layer } = await clipping(seed);
    drag(layer, 1, [100, 200], [300, 260]);
    await vi.waitFor(() => expect((screen.getByRole("combobox", { name: "Citation key" }) as HTMLInputElement).value).toBe("luhmann1981"));
    expect(screen.getByText("Luhmann, 1981 · A Zettelkasten primer")).toBeTruthy();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("says when a key is not in the bibliography yet, and keeps it", async () => {
    const { layer } = await clipping();
    drag(layer, 1, [100, 200], [300, 260]);
    fireEvent.change(screen.getByRole("combobox", { name: "Citation key" }), { target: { value: "nobody1999" } });
    expect(await screen.findByText(/Not in the vault's \.bib files yet/)).toBeTruthy();
  });
});
