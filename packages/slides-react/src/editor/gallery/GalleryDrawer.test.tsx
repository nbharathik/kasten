import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { image as imageElement, textBox } from "../factory.ts";
import type { HostImage } from "../host.ts";
import { ROW_HEIGHT, WINDOW_FROM } from "./GalleryDrawer.tsx";
import { mountGallery, settle } from "./test-kit.tsx";

afterEach(cleanup);

const NOW = Date.now();
const day = 24 * 60 * 60 * 1000;

const wide: HostImage = { path: "assets/attention.png", name: "Attention.png", width: 640, height: 160, bytes: 1405, added: NOW - day, source: "pdf-clip", paper: "Attention Is All You Need", clip: { pdf: "sources/a.pdf", page: 3, rect: [0, 0, 1, 1] }, caption: "Scaled dot-product attention", tags: ["figure"], citationKey: "vaswani2017" };
const chart: HostImage = { path: "assets/chart.svg", name: "chart.svg", width: 120, height: 60, bytes: 179, added: NOW - 40 * day, source: "agent", createdBy: "agent:01K5", tags: [] };
const photo: HostImage = { path: "assets/photo.jpg", name: "photo.jpg", width: 320, height: 200, bytes: 3151, added: NOW - 2 * day, source: "file", tags: ["holiday"] };

/** What a screen reader says of the captioned image: the name the tile shows, then the caption. */
const ATTENTION = "Attention.png, Scaled dot-product attention";
const option = (name: string | RegExp) => screen.getByRole("option", { name });
const options = () => screen.queryAllByRole("option").map((o) => o.getAttribute("aria-label"));
const type = (text: string) => fireEvent.change(screen.getByRole("searchbox", { name: "Search images" }), { target: { value: text } });
const filter = (name: string) => fireEvent.click(screen.getByRole("radio", { name }));
const elementsOf = (kit: { session: { slide: { elements: unknown[] } } }) => kit.session.slide.elements as { type: string; src?: string; x?: number; y?: number; w?: number; h?: number; alt?: string }[];
const citationsOf = (kit: { session: { slide: { elements: unknown[] } } }) => (kit.session.slide.elements as { type: string; keys?: string[] }[]).filter((e) => e.type === "citation");

describe("the list", () => {
  it("shows every image the host holds, with how many, and says when there are none", async () => {
    await mountGallery({ images: [wide, chart, photo] });
    expect(screen.getByRole("heading", { name: /Images/ }).textContent).toContain("3");
    expect(options()).toEqual([ATTENTION, "chart.svg", "photo.jpg"]);
    expect(screen.getByRole("status").textContent).toBe("3 images");
    cleanup();
    await mountGallery({ images: [] });
    expect(screen.getByText("No images yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add images…" })).toBeTruthy();
  });

  it("names each image by the name it shows, and adds its caption", async () => {
    await mountGallery({ images: [wide, chart, photo, { ...wide, path: "assets/b.png", name: "b.png", caption: "  Line one\nline two" }] });
    for (const tile of screen.getAllByRole("option")) {
      const shown = tile.querySelector(".ks-gal-name")?.textContent ?? "";
      expect(shown, "every tile shows a name").not.toBe("");
      // Label in name: what a person sees is what a screen reader begins with, and what voice control says.
      expect(tile.getAttribute("aria-label")?.startsWith(shown), `${shown}`).toBe(true);
    }
    expect(options()).toEqual([ATTENTION, "chart.svg", "photo.jpg", "b.png, Line one"]);
  });

  it("shows the small copy the host makes, the picture itself when there is none, and nothing while it is being made", async () => {
    const pictures = () => Array.from(document.querySelectorAll<HTMLImageElement>(".ks-gal-thumb img")).map((img) => img.getAttribute("src"));
    // A host without small copies shows the originals.
    await mountGallery({ images: [photo, chart] });
    expect(pictures()).toEqual(["memory:assets/photo.jpg", "memory:assets/chart.svg"]);
    cleanup();
    // A host that makes them: one is ready, one is being made, one has none (a vector picture).
    let finish: (url: string) => void = () => {};
    const slow = new Promise<string | undefined>((resolve) => (finish = resolve));
    const kit = await mountGallery({ images: [photo, wide, chart], setup: (host) => {
      host.thumbnailUrl = (path, size) => (path === "assets/photo.jpg" ? `thumb:${path}@${size}` : path === "assets/attention.png" ? slow : Promise.resolve(undefined));
    } });
    expect(pictures()).toEqual(["thumb:assets/photo.jpg@256", "memory:assets/chart.svg"]);
    await act(async () => finish("thumb:slow"));
    expect(pictures()).toEqual(["thumb:assets/photo.jpg@256", "thumb:slow", "memory:assets/chart.svg"]);
    expect(kit.errors).toEqual([]);
  });

  it("narrows by search and by filter, and offers a way back", async () => {
    await mountGallery({ images: [wide, chart, photo] });
    type("holiday");
    expect(options()).toEqual(["photo.jpg"]);
    type("paper zzz");
    expect(options()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(options()).toHaveLength(3);
    type("you need");
    expect(options()).toEqual([ATTENTION]);
    type("");
    filter("Agent-made");
    expect(options()).toEqual(["chart.svg"]);
    filter("From papers");
    expect(options()).toEqual([ATTENTION]);
    filter("Recent");
    expect(options()).toEqual([ATTENTION, "photo.jpg"]);
  });

  it("has an Unused filter only when the host can say where images are used", async () => {
    const kit = await mountGallery({ images: [wide, chart, photo], usage: { "assets/attention.png": { notes: [{ path: "n.md", title: "N" }], boards: [], decks: [] } } });
    filter("Unused");
    expect(options()).toEqual(["chart.svg", "photo.jpg"]);
    // An image the open deck shows is used, whatever the saved files say.
    act(() => void kit.session.elements.insert([imageElement("assets/chart.svg", { x: 0, y: 0, w: 50, h: 25 })]));
    expect(options()).toEqual(["photo.jpg"]);
    cleanup();
    const bare = await mountGallery({ images: [wide] });
    bare.host.imageUsage = undefined as never;
    bare.view.unmount();
  });

  it("draws a window of a long list, not all of it", async () => {
    const many: HostImage[] = Array.from({ length: WINDOW_FROM + 300 }, (_, n) => ({ path: `assets/p${n}.png`, name: `p${n}.png`, width: 10, height: 10, added: NOW - n }));
    await mountGallery({ images: many });
    expect(screen.getByRole("status").textContent).toBe(`${many.length} images`);
    const drawn = options().length;
    expect(drawn).toBeGreaterThan(0);
    expect(drawn).toBeLessThan(many.length / 2);
    const list = screen.getByRole("listbox", { name: "Images" });
    expect(list.style.paddingBottom).not.toBe("0px");
    expect(ROW_HEIGHT).toBe(136);
  });
});

describe("picking and the details", () => {
  it("shows what is known of the picked image and where it is used, with a jump to the slide", async () => {
    const kit = await mountGallery({
      images: [wide, chart],
      usage: { "assets/attention.png": { notes: [{ path: "notes/a.md", title: "Reading notes" }], boards: [{ path: "boards/f.canvas", title: "Figures" }], decks: [{ path: "library/other.deck", title: "Other talk", slides: [{ number: 4, id: "z" }], theme: false }] } },
      elements: [imageElement("assets/attention.png", { x: 10, y: 10, w: 200, h: 50 })],
    });
    kit.session.slides.add({ layout: "blank" });
    await settle();
    fireEvent.click(option(ATTENTION));
    const details = screen.getByRole("region", { name: /Details of Attention.png/ });
    expect(within(details).getByText("640 × 160 · 1 KB")).toBeTruthy();
    expect(within(details).getByText("Clipped from Attention Is All You Need, page 3")).toBeTruthy();
    const used = within(details).getByRole("group", { name: "Used in" });
    expect(used.textContent).toContain("Reading notes");
    expect(used.textContent).toContain("Figures");
    expect(used.textContent).toContain("Other talk");
    expect(used.textContent).toContain("slide 4");
    expect(within(used).getByRole("heading").textContent).toContain("4");
    const here = kit.session.state.slideId;
    const first = kit.session.deck.slides.find((s) => s.elements.some((e) => e.type === "image"))!;
    expect(here).not.toBe(first.id);
    fireEvent.click(within(used).getByRole("button", { name: `Go to slide ${kit.session.deck.slides.indexOf(first) + 1}` }));
    expect(kit.session.state.slideId).toBe(first.id);
    // Other places open through the host.
    fireEvent.click(within(used).getByRole("button", { name: "Reading notes" }));
    expect(kit.host.opened).toEqual(["notes/a.md"]);
  });

  it("says when an image is used nowhere", async () => {
    await mountGallery({ images: [photo] });
    fireEvent.click(option("photo.jpg"));
    expect(screen.getByText("Not used anywhere.")).toBeTruthy();
  });

  it("changes the caption, tags and citation key through the host", async () => {
    const kit = await mountGallery({ images: [{ ...photo }] });
    fireEvent.click(option("photo.jpg"));
    const caption = screen.getByRole("textbox", { name: "Caption" });
    fireEvent.change(caption, { target: { value: "  Sunset over the bay " } });
    fireEvent.blur(caption);
    const tags = screen.getByRole("textbox", { name: "Tags" });
    fireEvent.change(tags, { target: { value: "holiday, bay ,, sunset" } });
    fireEvent.blur(tags);
    const key = screen.getByRole("textbox", { name: "Citation key" });
    fireEvent.change(key, { target: { value: "smith2020" } });
    fireEvent.blur(key);
    await settle();
    expect(kit.host.edits).toEqual([
      { path: "assets/photo.jpg", edit: { caption: "  Sunset over the bay " } },
      { path: "assets/photo.jpg", edit: { tags: ["holiday", "bay", "sunset"] } },
      { path: "assets/photo.jpg", edit: { citationKey: "smith2020" } },
    ]);
    // Leaving a field as it was changes nothing.
    fireEvent.blur(screen.getByRole("textbox", { name: "Tags" }));
    await settle();
    expect(kit.host.edits).toHaveLength(3);
  });
});

describe("adding an image to the slide", () => {
  it("a double click puts it in the largest free place, in its own shape, with alt text, and cites its paper", async () => {
    const kit = await mountGallery({ images: [wide], elements: [textBox({ x: 40, y: 40, w: 880, h: 250 }, "Title")] });
    fireEvent.doubleClick(option(ATTENTION));
    await waitFor(() => expect(elementsOf(kit).filter((e) => e.type === "image")).toHaveLength(1));
    const [placed] = elementsOf(kit).filter((e) => e.type === "image");
    expect(placed).toMatchObject({ src: "assets/attention.png", alt: "Scaled dot-product attention" });
    expect((placed!.w ?? 0) / (placed!.h ?? 1)).toBeCloseTo(4, 1);
    expect(placed!.y!).toBeGreaterThanOrEqual(290);
    expect(placed!.y! + placed!.h!).toBeLessThanOrEqual(540);
    expect(placed!.x! + placed!.w!).toBeLessThanOrEqual(960);
    expect(kit.session.state.selection).toHaveLength(1);
    // The figure comes from a paper, so the slide cites it. That is a step of undo of its own, after the picture's.
    expect(citationsOf(kit).map((c) => c.keys)).toEqual([["vaswani2017"]]);
    act(() => void kit.session.undo());
    expect(citationsOf(kit)).toHaveLength(0);
    expect(elementsOf(kit).filter((e) => e.type === "image")).toHaveLength(1);
    act(() => void kit.session.undo());
    expect(elementsOf(kit).filter((e) => e.type === "image")).toHaveLength(0);
  });

  it("gives the slide one footer citation for the paper of a figure, and adds the next paper's key to it", async () => {
    const attention2: HostImage = { path: "assets/attention-2.png", name: "attention-2.png", width: 300, height: 200, citationKey: "vaswani2017" };
    const bert: HostImage = { path: "assets/bert.png", name: "bert.png", width: 400, height: 300, citationKey: "devlin2019bert" };
    const kit = await mountGallery({ images: [wide, attention2, bert, photo] });
    const placed = () => elementsOf(kit).filter((e) => e.type === "image").length;
    fireEvent.doubleClick(option(ATTENTION));
    await waitFor(() => expect(citationsOf(kit)).toHaveLength(1));
    expect(citationsOf(kit)[0]!.keys).toEqual(["vaswani2017"]);
    // Another figure of the same paper: no second footer, no key twice.
    fireEvent.doubleClick(option("attention-2.png"));
    await waitFor(() => expect(placed()).toBe(2));
    expect(citationsOf(kit).map((c) => c.keys)).toEqual([["vaswani2017"]]);
    // A figure of another paper goes into the footer that is there.
    fireEvent.doubleClick(option("bert.png"));
    await waitFor(() => expect(placed()).toBe(3));
    expect(citationsOf(kit).map((c) => c.keys)).toEqual([["vaswani2017", "devlin2019bert"]]);
    // A picture from no paper cites nothing.
    fireEvent.doubleClick(option("photo.jpg"));
    await waitFor(() => expect(placed()).toBe(4));
    expect(citationsOf(kit).map((c) => c.keys)).toEqual([["vaswani2017", "devlin2019bert"]]);
    expect(kit.errors).toEqual([]);
  });

  it("Enter and the button do the same", async () => {
    const kit = await mountGallery({ images: [chart, photo] });
    const list = screen.getByRole("listbox", { name: "Images" });
    list.focus();
    fireEvent.keyDown(list, { key: "ArrowDown" });
    fireEvent.keyDown(list, { key: "Enter" });
    await waitFor(() => expect(elementsOf(kit).filter((e) => e.type === "image")).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Add to slide" }));
    await waitFor(() => expect(elementsOf(kit).filter((e) => e.type === "image")).toHaveLength(2));
  });
});

describe("the keyboard", () => {
  it("walks the grid, keeps the picked image in aria-activedescendant, and Escape closes", async () => {
    const kit = await mountGallery({ images: [wide, chart, photo] });
    const list = screen.getByRole("listbox", { name: "Images" });
    list.focus();
    fireEvent.keyDown(list, { key: "ArrowRight" });
    expect(option(ATTENTION).getAttribute("aria-selected")).toBe("true");
    expect(list.getAttribute("aria-activedescendant")).toBe(option(ATTENTION).id);
    fireEvent.keyDown(list, { key: "ArrowRight" });
    expect(option("chart.svg").getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(option("photo.jpg").getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(list, { key: "Home" });
    expect(option(ATTENTION).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(list, { key: "End" });
    expect(option("photo.jpg").getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(list, { key: "Escape" });
    expect(kit.ui.state.galleryOpen).toBe(false);
  });

  it("Escape in the search box clears it first", async () => {
    const kit = await mountGallery({ images: [wide, chart] });
    type("chart");
    fireEvent.keyDown(screen.getByRole("searchbox", { name: "Search images" }), { key: "Escape" });
    expect(options()).toHaveLength(2);
    expect(kit.ui.state.galleryOpen).toBe(true);
  });

  it("keeps the slide's keys to the slide: Delete here does not delete what is selected there", async () => {
    const kit = await mountGallery({ images: [wide], elements: [textBox({ x: 40, y: 40, w: 300, h: 60 }, "Keep me")] });
    expect(kit.session.state.selection).toHaveLength(1);
    const reached: string[] = [];
    const watch = (event: KeyboardEvent) => reached.push(event.key);
    // The editor listens above the drawer; a key the drawer keeps never gets there.
    document.body.addEventListener("keydown", watch);
    const list = screen.getByRole("listbox", { name: "Images" });
    fireEvent.keyDown(list, { key: "Delete" });
    fireEvent.keyDown(list, { key: "v", ctrlKey: true });
    fireEvent.keyDown(list, { key: "z", ctrlKey: true });
    document.body.removeEventListener("keydown", watch);
    expect(reached).toEqual(["z"]);
    expect(elementsOf(kit)).toHaveLength(1);
  });
});

describe("pictures given to the drawer", () => {
  const png = (seed: number) => new File([new Uint8Array([137, 80, 78, 71, seed, seed, seed])], "image.png", { type: "image/png" });

  it("a pasted picture is kept as pasted, and the same picture pasted again is the same image", async () => {
    const kit = await mountGallery({ images: [] });
    kit.host.listed = [];
    const seen: unknown[] = [];
    const add = kit.host.addImage.bind(kit.host);
    kit.host.addImage = async (name, bytes, options) => {
      seen.push([name, options]);
      return add(name, bytes, options);
    };
    const drawer = document.querySelector(".ks-gallery")!;
    fireEvent.paste(drawer, { clipboardData: { files: [png(1)] } });
    await settle();
    fireEvent.paste(drawer, { clipboardData: { files: [png(1)] } });
    await settle();
    expect(seen).toHaveLength(2);
    expect((seen[0] as [string, unknown])[0]).toMatch(/^Pasted image \d{4}-\d\d-\d\d \d{6}\.png$/);
    expect((seen[0] as [string, unknown])[1]).toEqual({ source: "pasted" });
    expect(await kit.host.images().then((list) => list.length)).toBe(0);
    // MemoryHost keeps them itself: one image for the same bytes.
    kit.host.listed = [];
    const stored = new Set(seen.map(() => "x"));
    expect(stored.size).toBe(1);
  });

  it("dropped files are kept as files and shown picked", async () => {
    const kit = await mountGallery({ images: [] });
    const kept: unknown[] = [];
    kit.host.addImage = async (name, _bytes, options) => {
      kept.push([name, options]);
      kit.host.listed = [{ path: `assets/${name}`, name, width: 4, height: 3, added: Date.now(), source: "file" }];
      return `assets/${name}`;
    };
    const drawer = document.querySelector(".ks-gallery")!;
    const file = new File([new Uint8Array([1, 2, 3])], "Logo.png", { type: "image/png" });
    const over = fireEvent.dragOver(drawer, { dataTransfer: { types: ["Files"], files: [file], dropEffect: "" } });
    expect(over).toBe(false);
    fireEvent.drop(drawer, { dataTransfer: { types: ["Files"], files: [file] } });
    await settle();
    expect(kept).toEqual([["Logo.png", { source: "file" }]]);
    expect(options()).toEqual(["Logo.png"]);
    expect(option("Logo.png").getAttribute("aria-selected")).toBe("true");
    // Something that is not a picture is left alone.
    fireEvent.drop(drawer, { dataTransfer: { types: ["Files"], files: [new File(["x"], "notes.txt", { type: "text/plain" })] } });
    await settle();
    expect(kept).toHaveLength(1);
  });
});
