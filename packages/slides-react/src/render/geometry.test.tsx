// @vitest-environment node

import type { Element } from "@kasten-slides/wasm";
import { describe, expect, it, vi } from "vitest";

import { SlideView } from "./SlideView.tsx";
import { blocks, draw, elementsOf, styleOf } from "./testing/dom.ts";
import { box, scene, words } from "./testing/decks.ts";

vi.mock("../text/TextBlock.tsx", () => import("./testing/mock-text-block.tsx"));

async function drawn(element: Element, id = "e") {
  const { deck, slide } = await scene("blank", [element]);
  const page = draw(<SlideView deck={deck} slide={slide} />);
  return { page, el: elementsOf(page).get(id) };
}

const shape = (extra: Partial<Element> = {}): Element => ({ type: "shape", id: "e", shape: "rect", ...box(100, 50, 200, 80), ...extra }) as Element;
const line = (extra: Partial<Element> = {}): Element => ({ type: "line", id: "e", ...box(100, 50, 200, 80), style: { stroke: { color: "text1", width: 2 } }, ...extra }) as Element;

describe("a shape", () => {
  it("is an SVG the size of its box, drawing the preset in the style's fill and outline", async () => {
    const { el } = await drawn(shape({ shape: "roundRect", style: { fill: { color: "accent1", alpha: 0.5 }, stroke: { color: "text1", width: 3, dash: "dash" }, radius: 12 } }));
    const svg = el?.querySelector("svg.ks-shape");
    expect(svg?.getAttribute("width")).toBe("200");
    expect(svg?.getAttribute("height")).toBe("80");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 200 80");
    const path = svg?.querySelector("path");
    expect(path?.getAttribute("d")).toBe("M12 0H188A12 12 0 0 1 200 12V68A12 12 0 0 1 188 80H12A12 12 0 0 1 0 68V12A12 12 0 0 1 12 0Z");
    expect(path?.getAttribute("fill")).toBe("rgba(26, 115, 232, 0.5)");
    expect(path?.getAttribute("stroke")).toBe("#202124");
    expect(path?.getAttribute("stroke-width")).toBe("3");
    expect(path?.getAttribute("stroke-dasharray")).toBe("12 9");
  });

  it("is drawn without a fill or an outline when the style names none", async () => {
    const path = (await drawn(shape())).el?.querySelector("svg path");
    expect(path?.getAttribute("fill")).toBe("none");
    expect(path?.getAttribute("stroke")).toBe("none");
  });

  it("casts a shadow", async () => {
    const { el } = await drawn(shape({ style: { fill: { color: "bg2" }, shadow: { color: "text1", blur: 6, dx: 2, dy: 3, alpha: 0.3 } } }));
    expect(styleOf(el?.querySelector("svg")).filter).toBe("drop-shadow(2px 3px 6px rgba(32, 33, 36, 0.3))");
  });

  it("draws an ellipse with arcs", async () => {
    const path = (await drawn(shape({ shape: "ellipse" }))).el?.querySelector("svg path");
    expect(path?.getAttribute("d")).toBe("M0 40A100 40 0 1 1 200 40A100 40 0 1 1 0 40Z");
  });

  it("has its text on top, in the middle unless the text says otherwise", async () => {
    const { page } = await drawn(shape({ text: words("Inside") }));
    const [block] = blocks(page);
    expect(block).toMatchObject({ el: "e", words: "Inside", baseStyle: "body", valign: "middle", width: 200, height: 80 });
    expect(block?.insets).toEqual({ left: 9.6, top: 4.8, right: 9.6, bottom: 4.8 });
  });

  it("puts the text of an ellipse in the rectangle inside it", async () => {
    const { el, page } = await drawn(shape({ shape: "ellipse", text: words("Inside") }));
    const [block] = blocks(page);
    expect(block?.width).toBeCloseTo(141.42, 1);
    expect(block?.height).toBeCloseTo(56.57, 1);
    const area = el?.querySelector(".ks-text-rect");
    expect(parseFloat(styleOf(area).left ?? "")).toBeCloseTo(29.29, 1);
  });

  it("keeps the text upright when the shape is flipped, and sets it where the flipped outline has room", async () => {
    const { el } = await drawn(shape({ shape: "rightArrow", flipH: true, text: words("Go") }));
    expect(styleOf(el).transform).toBe("rotate(0deg) scale(-1, 1)");
    expect(styleOf(el?.querySelector(".ks-text-rect .ks-fill")).transform).toBe("scale(-1, 1)");
  });

  it("has no text block when it has no text", async () => {
    expect(blocks((await drawn(shape())).page)).toEqual([]);
  });

  it("draws a preset it does not know as a dashed box with its name", async () => {
    const { el } = await drawn(shape({ shape: "cloudCallout" }));
    expect(el?.querySelector(".ks-unknown")?.textContent).toBe("cloudCallout");
    expect(el?.querySelector("svg path")?.getAttribute("d")).toBe("M0 0L200 0L200 80L0 80Z");
  });

  it("asks for a rounded corner only where the preset has one", async () => {
    const { el } = await drawn(shape({ shape: "triangle", style: { radius: 30, fill: { color: "bg2" } } }));
    expect(el?.querySelector("svg path")?.getAttribute("d")).toBe("M0 80L100 0L200 80Z");
  });
});

describe("a line", () => {
  it("runs from the top left to the bottom right of its box", async () => {
    const { el } = await drawn(line());
    const svg = el?.querySelector("svg.ks-line");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 200 80");
    const paths = svg?.querySelectorAll("path") ?? [];
    expect(paths).toHaveLength(1);
    expect(paths[0]?.getAttribute("d")).toBe("M0 0L200 80");
    expect(paths[0]?.getAttribute("stroke")).toBe("#202124");
    expect(paths[0]?.getAttribute("stroke-width")).toBe("2");
    expect(paths[0]?.getAttribute("fill")).toBe("none");
  });

  it("runs along the other diagonal when flipped", async () => {
    const { el } = await drawn(line({ flipH: true }));
    expect(styleOf(el).transform).toBe("rotate(0deg) scale(-1, 1)");
  });

  it("goes by elbow or by curve", async () => {
    expect((await drawn(line({ route: "elbow" }))).el?.querySelector("path")?.getAttribute("d")).toBe("M0 0L100 0L100 80L200 80");
    expect((await drawn(line({ route: "curved" }))).el?.querySelector("path")?.getAttribute("d")).toBe("M0 0C100 0 100 80 200 80");
  });

  it("takes its dashes from the style, scaled by the width", async () => {
    const dashes = async (dash: string) =>
      (await drawn(line({ style: { stroke: { color: "text1", width: 2, dash: dash as never } } }))).el?.querySelector("path")?.getAttribute("stroke-dasharray");
    expect(await dashes("solid")).toBeNull();
    expect(await dashes("dash")).toBe("8 6");
    expect(await dashes("dot")).toBe("2 6");
    expect(await dashes("dashDot")).toBe("8 6 2 6");
    expect(await dashes("longDash")).toBe("16 6");
  });

  it("draws an arrowhead of each kind at the end, pointing along the line", async () => {
    for (const kind of ["triangle", "stealth", "open", "oval", "diamond"] as const) {
      const { el } = await drawn(line({ box: undefined, ...box(0, 0, 100, 0), style: { stroke: { color: "text1", width: 2 }, endArrow: kind } } as Partial<Element>));
      const paths = el?.querySelectorAll("svg path") ?? [];
      expect(paths, kind).toHaveLength(2);
      expect(paths[1]?.getAttribute("transform"), kind).toBe("translate(100 0) rotate(0)");
    }
  });

  it("stops the line short of a filled head so that it does not poke through", async () => {
    const { el } = await drawn(line({ ...box(0, 0, 100, 0), style: { stroke: { color: "text1", width: 2 }, endArrow: "triangle" } }));
    const [body, head] = el?.querySelectorAll("svg path") ?? [];
    expect(body?.getAttribute("d")).toBe("M0 0L92 0");
    expect(head?.getAttribute("d")).toBe("M0 0L-8 -4L-8 4Z");
    expect(head?.getAttribute("fill")).toBe("#202124");
  });

  it("does not shorten the line for an open head, which is only two strokes", async () => {
    const { el } = await drawn(line({ ...box(0, 0, 100, 0), style: { stroke: { color: "text1", width: 2 }, endArrow: "open" } }));
    const [body, head] = el?.querySelectorAll("svg path") ?? [];
    expect(body?.getAttribute("d")).toBe("M0 0L100 0");
    expect(head?.getAttribute("fill")).toBe("none");
    expect(head?.getAttribute("stroke")).toBe("#202124");
  });

  it("draws heads at both ends, the start one facing back", async () => {
    const { el } = await drawn(line({ ...box(0, 0, 100, 0), style: { stroke: { color: "text1", width: 2 }, startArrow: "triangle", endArrow: "triangle" } }));
    const paths = el?.querySelectorAll("svg path") ?? [];
    expect(paths).toHaveLength(3);
    expect(paths[0]?.getAttribute("d")).toBe("M8 0L92 0");
    expect(paths[1]?.getAttribute("transform")).toBe("translate(0 0) rotate(180)");
    expect(paths[2]?.getAttribute("transform")).toBe("translate(100 0) rotate(0)");
  });

  it("sizes the head from the width of the line, at least 8 units", async () => {
    const head = async (width: number) =>
      (await drawn(line({ ...box(0, 0, 100, 0), style: { stroke: { color: "text1", width }, endArrow: "triangle" } }))).el?.querySelectorAll("svg path")[1]?.getAttribute("d");
    expect(await head(1)).toBe("M0 0L-8 -4L-8 4Z");
    expect(await head(6)).toBe("M0 0L-18 -9L-18 9Z");
  });

  it("points the head down a line that runs down", async () => {
    const { el } = await drawn(line({ ...box(10, 10, 0, 100), style: { stroke: { color: "text1", width: 2 }, endArrow: "triangle" } }));
    expect(el?.querySelectorAll("svg path")[1]?.getAttribute("transform")).toBe("translate(0 100) rotate(90)");
  });

  it("points the head of an elbow along its last stretch", async () => {
    const { el } = await drawn(line({ route: "elbow", style: { stroke: { color: "text1", width: 2 }, endArrow: "triangle" } }));
    expect(el?.querySelectorAll("svg path")[1]?.getAttribute("transform")).toBe("translate(200 80) rotate(0)");
  });

  it("is still drawn when it has no width or no height", async () => {
    const flat = (await drawn(line({ ...box(10, 10, 200, 0), style: { stroke: { color: "text1", width: 4 } } }))).el?.querySelector("svg");
    expect(flat?.getAttribute("width")).toBe("200");
    expect(flat?.getAttribute("height")).toBe("4");
    const upright = (await drawn(line({ ...box(10, 10, 0, 100), style: { stroke: { color: "text1", width: 4 } } }))).el?.querySelector("svg");
    expect(upright?.getAttribute("width")).toBe("4");
    expect(upright?.getAttribute("height")).toBe("100");
    const point = (await drawn(line({ ...box(10, 10, 0, 0) }))).el?.querySelector("svg");
    expect(point?.getAttribute("width")).toBe("2");
  });

  it("is drawn in the text colour when it has no stroke of its own", async () => {
    const path = (await drawn(line({ style: undefined }))).el?.querySelector("path");
    expect(path?.getAttribute("stroke")).toBe("#202124");
    expect(path?.getAttribute("stroke-width")).toBe("1.5");
  });

  it("takes the outline's transparency", async () => {
    const path = (await drawn(line({ style: { stroke: { color: "accent1", width: 2, alpha: 0.5 } } }))).el?.querySelector("path");
    expect(path?.getAttribute("stroke")).toBe("rgba(26, 115, 232, 0.5)");
  });
});

describe("a connector", () => {
  const connector = (extra: Partial<Element> = {}): Element =>
    ({ type: "connector", id: "e", route: "elbow", ...box(100, 50, 200, 80), style: { stroke: { color: "text2", width: 2 }, endArrow: "triangle" }, ...extra }) as Element;

  it("is drawn like a line, by its own route", async () => {
    const { el } = await drawn(connector());
    const [body, head] = el?.querySelectorAll("svg path") ?? [];
    expect(body?.getAttribute("d")).toBe("M0 0L100 0L100 80L192 80");
    expect(head?.getAttribute("transform")).toBe("translate(200 80) rotate(0)");
  });

  it("has no label unless it is given one", async () => {
    expect(blocks((await drawn(connector())).page)).toEqual([]);
    expect((await drawn(connector())).el?.querySelector(".ks-label")).toBeNull();
  });

  it("puts its label on a chip of the slide's colour at the midpoint, its words centred", async () => {
    const { el, page } = await drawn(connector({ label: words("calls") } as Partial<Element>));
    const chip = el?.querySelector(".ks-label");
    const style = styleOf(chip);
    const width = parseFloat(style.width ?? "");
    const height = parseFloat(style.height ?? "");
    expect(width).toBeGreaterThan(20);
    expect(height).toBeGreaterThan(15);
    expect(parseFloat(style.left ?? "")).toBeCloseTo(100 - width / 2, 1);
    expect(parseFloat(style.top ?? "")).toBeCloseTo(40 - height / 2, 1);
    expect(style.background).toBe("#ffffff");
    const [block] = blocks(page);
    expect(block).toMatchObject({ el: "e", words: "calls", baseStyle: "caption", valign: "middle" });
    expect(block?.text.paragraphs[0]?.align).toBe("center");
    expect(block?.width).toBeCloseTo(width, 5);
  });

  it("puts the label on the slide's own colour when the slide has one", async () => {
    const { deck, slide } = await scene("blank", [connector({ label: words("calls") } as Partial<Element>)], {
      edit: (engine, id) => engine.apply("set_background", { slide: id, background: { color: "accent2" } }),
    });
    const chip = elementsOf(draw(<SlideView deck={deck} slide={slide} />)).get("e")?.querySelector(".ks-label");
    expect(styleOf(chip).background).toBe("#ea4335");
  });

  it("keeps the label upright when it is flipped", async () => {
    const { el } = await drawn(connector({ flipV: true, label: words("no") } as Partial<Element>));
    expect(styleOf(el).transform).toBe("rotate(0deg) scale(1, -1)");
    expect(styleOf(el?.querySelector(":scope > .ks-fill")).transform).toBe("scale(1, -1)");
  });

  it("leaves out a label with no words", async () => {
    expect((await drawn(connector({ label: words("  ") } as Partial<Element>))).el?.querySelector(".ks-label")).toBeNull();
  });
});
