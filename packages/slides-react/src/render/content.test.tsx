// @vitest-environment node

import type { Element } from "@kasten-slides/wasm";
import { describe, expect, it, vi } from "vitest";

import { SlideView } from "./SlideView.tsx";
import { blocks, draw, elementsOf, styleOf } from "./testing/dom.ts";
import { box, scene, words } from "./testing/decks.ts";

vi.mock("../text/TextBlock.tsx", () => import("./testing/mock-text-block.tsx"));

const urlOf = (src: string) => `blob:${src}`;

async function drawn(element: Element, mode: "edit" | "present" = "present", id = "e") {
  const { deck, slide } = await scene("blank", [element]);
  const page = draw(<SlideView deck={deck} slide={slide} mode={mode} imageUrl={urlOf} />);
  return { page, el: elementsOf(page).get(id) };
}

const image = (extra: Partial<Element> = {}): Element => ({ type: "image", id: "e", src: "assets/figure.png", ...box(100, 50, 200, 100), ...extra }) as Element;

describe("an image", () => {
  it("is the picture at the address imageUrl gives, stretched over its box", async () => {
    const { el } = await drawn(image());
    const img = el?.querySelector("img");
    expect(img?.getAttribute("src")).toBe("blob:assets/figure.png");
    expect(styleOf(img)).toEqual({ left: "0", top: "0", width: "100%", height: "100%" });
    expect(img?.getAttribute("draggable")).toBe("false");
  });

  it("has the alt text, or an empty one when it has none", async () => {
    expect((await drawn(image({ alt: "A figure" }))).el?.querySelector("img")?.getAttribute("alt")).toBe("A figure");
    expect((await drawn(image())).el?.querySelector("img")?.getAttribute("alt")).toBe("");
  });

  it("uses the stored path when no imageUrl is given", async () => {
    const { deck, slide } = await scene("blank", [image()]);
    expect(draw(<SlideView deck={deck} slide={slide} />).querySelector("img.ks-image-pic")?.getAttribute("src")).toBe("assets/figure.png");
  });

  it("is a grey box when imageUrl has no address for it", async () => {
    const { deck, slide } = await scene("blank", [image()]);
    const page = draw(<SlideView deck={deck} slide={slide} imageUrl={() => undefined} />);
    expect(page.querySelector("img.ks-image-pic")).toBeNull();
    expect(styleOf(page.querySelector(".ks-image-failed")).background).toBe("rgba(95, 99, 104, 0.25)");
  });

  it("shows the part left after a crop by drawing the whole picture larger and moving it", async () => {
    const { el } = await drawn(image({ crop: { left: 0.25, top: 0, right: 0.25, bottom: 0 } }));
    expect(styleOf(el?.querySelector("img"))).toEqual({ left: "-50%", top: "0%", width: "200%", height: "100%" });
    expect(el?.querySelector(".ks-image")).not.toBeNull();
  });

  it("is cut to a rounded rectangle by the mask, 12 units round by default", async () => {
    const at = async (extra: Partial<Element>) => styleOf((await drawn(image(extra))).el?.querySelector(".ks-image"))["border-radius"];
    expect(await at({ mask: "roundRect" })).toBe("12px");
    expect(await at({ mask: "roundRect", style: { radius: 30 } })).toBe("30px");
    expect(await at({ mask: "roundRect", style: { radius: 500 } })).toBe("50px");
    expect(await at({ mask: "ellipse" })).toBe("50%");
    expect(await at({ mask: "rect" })).toBeUndefined();
    expect(await at({})).toBeUndefined();
  });

  it("gets an outline that follows the mask, and a shadow", async () => {
    const { el } = await drawn(image({ mask: "ellipse", style: { stroke: { color: "accent1", width: 3 }, shadow: { color: "text1", blur: 4, dx: 1, dy: 2 } } }));
    const frame = el?.querySelector(".ks-image-frame");
    expect(styleOf(frame)).toMatchObject({ border: "3px solid #1a73e8", "border-radius": "50%" });
    expect(styleOf(el?.querySelector(".ks-image")).filter).toBe("drop-shadow(1px 2px 4px #202124)");
  });

  it("is turned and mirrored with its box", async () => {
    const { el } = await drawn(image({ rotation: 10, flipH: true }));
    expect(styleOf(el).transform).toBe("rotate(10deg) scale(-1, 1)");
  });

  describe("with no file", () => {
    async function slot(mode: "edit" | "present" | "thumbnail" | "export") {
      const { deck, slide, slots } = await scene("title-image", [], { keepSlots: true });
      const page = draw(<SlideView deck={deck} slide={slide} mode={mode} />);
      return { page, id: slots.image ?? "" };
    }

    it("shows an editor a dashed slot with an icon and what the layout asks for", async () => {
      const { page, id } = await slot("edit");
      const el = elementsOf(page).get(id);
      expect(el?.getAttribute("data-type")).toBe("image");
      expect(el?.querySelector(".ks-image-empty svg")).not.toBeNull();
      expect(el?.querySelector(".ks-image-empty span")?.textContent).toBe("Click to add image");
    });

    it("shows an audience nothing at all", async () => {
      for (const mode of ["present", "thumbnail", "export"] as const) {
        const { page, id } = await slot(mode);
        expect(elementsOf(page).has(id), mode).toBe(false);
      }
    });

    it("shows an editor a slot without a prompt when the image fills no placeholder", async () => {
      const { el } = await drawn(image({ src: "" }), "edit");
      expect(el?.querySelector(".ks-image-empty svg")).not.toBeNull();
      expect(el?.querySelector(".ks-image-empty span")).toBeNull();
    });

    it("leaves out the theme's own, which is a place for the owner's logo", async () => {
      const { deck, slide } = await scene("title-only", [], { theme: "Lecture" });
      for (const mode of ["edit", "present"] as const) {
        expect(elementsOf(draw(<SlideView deck={deck} slide={slide} mode={mode} />)).has("master-logo"), mode).toBe(false);
      }
    });

    it("draws the theme's logo once the owner has set one", async () => {
      const { deck, slide } = await scene("title-only", [], {
        theme: "Lecture",
        edit: (engine) => engine.apply("set_logo", { src: "assets/logo.png" }),
      });
      const found = elementsOf(draw(<SlideView deck={deck} slide={slide} imageUrl={urlOf} />)).get("master-logo");
      expect(found?.querySelector("img")?.getAttribute("src")).toBe("blob:assets/logo.png");
    });
  });
});

describe("a group", () => {
  const group = (extra: Partial<Element> = {}): Element =>
    ({
      type: "group",
      id: "e",
      children: [
        { type: "shape", id: "a", shape: "rect", ...box(100, 100, 50, 50) },
        { type: "shape", id: "b", shape: "ellipse", ...box(300, 200, 80, 60), rotation: 15 },
      ],
      ...extra,
    }) as Element;

  it("is a transparent box over the whole slide, holding its children where they are", async () => {
    const { el } = await drawn(group());
    expect(el?.className).toBe("ks-group");
    expect(el?.getAttribute("data-type")).toBe("group");
    expect(styleOf(el)).toEqual({ position: "absolute", left: "0", top: "0", width: "960px", height: "540px", "pointer-events": "none" });
    const kids = [...(el?.querySelectorAll(":scope > .ks-el") ?? [])];
    expect(kids.map((kid) => kid.getAttribute("data-el"))).toEqual(["a", "b"]);
    expect(styleOf(kids[0])).toMatchObject({ left: "100px", top: "100px", width: "50px", height: "50px" });
    expect(styleOf(kids[1])).toMatchObject({ left: "300px", top: "200px", transform: "rotate(15deg) scale(1, 1)" });
  });

  it("holds groups too", async () => {
    const inner = { type: "group", id: "inner", children: [{ type: "shape", id: "deep", shape: "rect", ...box(0, 0, 10, 10) }] };
    const outer = group({ children: [inner, { type: "shape", id: "b", shape: "rect", ...box(20, 20, 10, 10) }] } as Partial<Element>);
    const page = (await drawn(outer)).page;
    expect([...elementsOf(page).keys()].filter((id) => id !== "master-number")).toEqual(["e", "inner", "deep", "b"]);
    expect(elementsOf(page).get("deep")?.closest(".ks-group[data-el=inner]")).not.toBeNull();
  });

  it("is faded when its style says, without fading its children twice", async () => {
    const { el } = await drawn(group({ style: { opacity: 0.5 } }));
    expect(styleOf(el).opacity).toBe("0.5");
    expect(styleOf(el?.querySelector(".ks-el")).opacity).toBeUndefined();
  });
});

describe("a table", () => {
  const cell = (t: string, extra: object = {}) => ({ text: words(t), ...extra });
  const table = (extra: Partial<Element> = {}): Element =>
    ({
      type: "table",
      id: "e",
      ...box(60, 380, 400, 90),
      columns: [100, 300],
      headerRow: true,
      rows: [{ cells: [cell("Name"), cell("Value")] }, { cells: [cell("alpha"), cell("1", { fill: { color: "accent1", alpha: 0.2 } })] }],
      ...extra,
    }) as Element;

  it("is an HTML table with the column widths, fixed", async () => {
    const { el } = await drawn(table());
    const html = el?.querySelector("table.ks-table");
    expect(styleOf(html)).toEqual({ width: "400px", height: "90px" });
    expect([...(html?.querySelectorAll("col") ?? [])].map((col) => styleOf(col).width)).toEqual(["100px", "300px"]);
    expect([...(html?.querySelectorAll("tr") ?? [])].map((tr) => styleOf(tr).height)).toEqual(["45px", "45px"]);
  });

  it("has a text block for each cell, sized to the cell, and the header row in bold", async () => {
    const { page } = await drawn(table());
    const found = blocks(page);
    expect(found.map((b) => b.words)).toEqual(["Name", "Value", "alpha", "1"]);
    expect(found.map((b) => [b.width, b.height, b.valign, b.baseStyle])).toEqual([
      [100, 45, "top", "body"],
      [300, 45, "top", "body"],
      [100, 45, "top", "body"],
      [300, 45, "top", "body"],
    ]);
    expect(found.map((b) => b.text.paragraphs[0]?.runs[0]?.b === true)).toEqual([true, true, false, false]);
  });

  it("does not make the first row bold without a header row", async () => {
    const { page } = await drawn(table({ headerRow: false } as Partial<Element>));
    expect(blocks(page).every((b) => b.text.paragraphs[0]?.runs[0]?.b !== true)).toBe(true);
  });

  it("fills a cell with its colour and draws thin grey lines between cells", async () => {
    const { el } = await drawn(table());
    const cells = [...(el?.querySelectorAll("td") ?? [])];
    expect(styleOf(cells[3]).background).toBe("rgba(26, 115, 232, 0.2)");
    expect(styleOf(cells[0]).background).toBeUndefined();
    expect(styleOf(cells[0])["border-color"]).toBe("rgba(95, 99, 104, 0.3)");
  });

  it("spans columns and rows", async () => {
    const spanned = table({
      columns: [100, 100, 100],
      w: 300,
      rows: [{ cells: [cell("wide", { colSpan: 2 }), cell("tall", { rowSpan: 2 })] }, { cells: [cell("a"), cell("b")] }],
    } as Partial<Element>);
    const { el, page } = await drawn(spanned);
    const cells = [...(el?.querySelectorAll("td") ?? [])];
    expect(cells.map((td) => [td.getAttribute("colspan"), td.getAttribute("rowspan")])).toEqual([["2", "1"], ["1", "2"], ["1", "1"], ["1", "1"]]);
    expect(blocks(page).map((b) => [b.words, b.width, b.height])).toEqual([["wide", 200, 45], ["tall", 100, 90], ["a", 100, 45], ["b", 100, 45]]);
  });

  it("is never mirrored, even when its box is flipped", async () => {
    const flipped = (await drawn(table({ flipH: true } as Partial<Element>))).el;
    expect(styleOf(flipped).transform).toBe("rotate(0deg) scale(-1, 1)");
    expect(styleOf(flipped?.querySelector(":scope > .ks-fill")).transform).toBe("scale(-1, 1)");
    expect(flipped?.querySelector(":scope > .ks-fill > table")).not.toBeNull();
    expect((await drawn(table())).el?.querySelector(".ks-fill")).toBeNull();
  });

  it("is scaled to its box when the box was resized without the columns", async () => {
    const { el } = await drawn(table({ w: 200 } as Partial<Element>));
    expect([...(el?.querySelectorAll("col") ?? [])].map((col) => styleOf(col).width)).toEqual(["50px", "150px"]);
  });
});

describe("raw", () => {
  it("is its preview picture when it has one", async () => {
    const { el } = await drawn({ type: "raw", id: "e", ...box(0, 0, 100, 50), original: "pptx:chart", preview: "assets/chart.png" });
    expect(el?.querySelector("img")?.getAttribute("src")).toBe("blob:assets/chart.png");
    expect(el?.querySelector(".ks-raw")).toBeNull();
  });

  it("is a grey box labelled with what it was", async () => {
    const { el } = await drawn({ type: "raw", id: "e", ...box(0, 0, 100, 50), original: "pptx:chart" });
    expect(el?.querySelector(".ks-raw")?.textContent).toBe("pptx:chart");
    expect(styleOf(el?.querySelector(".ks-raw")).background).toBe("rgba(95, 99, 104, 0.15)");
  });

  it("says so when it does not know what it was", async () => {
    const { el } = await drawn({ type: "raw", id: "e", ...box(0, 0, 100, 50) });
    expect(el?.querySelector(".ks-raw")?.textContent).toBe("Unsupported content");
  });
});

describe("an element of a kind this build does not know", () => {
  it("is a labelled box, so that a deck from a newer build shows what is there", async () => {
    const { deck, slide } = await scene("blank");
    const future = { type: "hologram", id: "future", ...box(10, 10, 100, 50), language: "rust" } as unknown as Element;
    const page = draw(<SlideView deck={deck} slide={{ ...slide, elements: [future] }} />);
    const el = elementsOf(page).get("future");
    expect(el?.getAttribute("data-type")).toBe("hologram");
    expect(el?.querySelector(".ks-raw")?.textContent).toBe("hologram");
  });

  it("is also what a composite becomes when it cannot be expanded, so one bad element never blanks the slide", async () => {
    const { deck, slide } = await scene("blank");
    // A code block with no code: what an agent or an older file could leave behind.
    const broken = { type: "code", id: "broken", ...box(10, 10, 100, 50), language: "rust" } as unknown as Element;
    const page = draw(<SlideView deck={deck} slide={{ ...slide, elements: [broken] }} />);
    expect(elementsOf(page).get("broken")?.querySelector(".ks-raw")?.textContent).toBe("code");
  });
});
