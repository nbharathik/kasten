import type { Layout } from "@kasten-slides/wasm";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { newDeck } from "../../../test/engine.ts";
import { Wireframe } from "./Wireframe.tsx";

afterEach(cleanup);

async function layouts(): Promise<Record<string, Layout>> {
  const engine = await newDeck();
  return Object.fromEntries(engine.deck.theme.layouts.map((layout) => [layout.name, layout]));
}
const size = { w: 960, h: 540 };
const draw = (layout: Layout) => render(<Wireframe layout={layout} size={size} />).container.querySelector("svg") as SVGSVGElement;

describe("Wireframe", () => {
  it("is drawn in the units of the slide, so the boxes are where the layout puts them", async () => {
    const { "two-columns": two } = await layouts();
    const svg = draw(two as Layout);
    expect(svg.getAttribute("viewBox")).toBe("0 0 960 540");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    const boxes = [...svg.querySelectorAll("rect.ks-wf-text")].map((r) => [r.getAttribute("x"), r.getAttribute("y"), r.getAttribute("width"), r.getAttribute("height")]);
    expect(boxes).toEqual((two as Layout).placeholders.map((p) => [String(p.x), String(p.y), String(p.w), String(p.h)]));
  });

  it("draws the slide itself first, then its slots", async () => {
    const { title } = await layouts();
    const svg = draw(title as Layout);
    expect(svg.firstElementChild?.getAttribute("class")).toBe("ks-wf-page");
    expect([...svg.children].length).toBe(1 + (title as Layout).placeholders.length);
  });

  it("marks a slot for a picture with a cross, and a slot for words with lines of them", async () => {
    const { "title-image": withImage } = await layouts();
    const svg = draw(withImage as Layout);
    expect(svg.querySelectorAll("rect.ks-wf-image")).toHaveLength(1);
    expect(svg.querySelectorAll("path.ks-wf-cross")).toHaveLength(1);
    // The title is one heavy bar; the body several light ones.
    expect(svg.querySelectorAll("line.ks-wf-bar.is-heavy")).toHaveLength(1);
    expect(svg.querySelectorAll("line.ks-wf-bar:not(.is-heavy)").length).toBeGreaterThanOrEqual(3);
  });

  it("puts the words of a slot where the slot puts them: at the top, middle or bottom", async () => {
    const { title, "title-body": body } = await layouts();
    const bars = (layout: Layout) => [...draw(layout).querySelectorAll("line.ks-wf-bar")].map((l) => Number(l.getAttribute("y1")));
    const cover = (title as Layout).placeholders[0]!;
    // The cover title hangs from the bottom of its box.
    expect(bars(title as Layout)[0]).toBeGreaterThan(cover.y + cover.h / 2);
    cleanup();
    const heading = (body as Layout).placeholders[0]!;
    // A content title is centred in its box.
    expect(bars(body as Layout)[0]).toBeCloseTo(heading.y + heading.h / 2, 0);
  });

  it("draws nothing but the page for a blank layout", async () => {
    const { blank } = await layouts();
    expect(draw(blank as Layout).children).toHaveLength(1);
  });
});
