// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { newDeck } from "../test/engine.ts";
import { SlideView } from "./SlideView.tsx";

describe("a slide with a composite", () => {
  it("draws the composite as the parts it expands to, under the composite's own id", async () => {
    const engine = await newDeck("Composite");
    const slide = engine.deck.slides[0]!.id;
    engine.apply("add_elements", { slide, elements: [{ type: "code", id: "e-code", x: 40, y: 40, w: 400, h: 200, language: "python", code: "print(1)" }] });
    const html = renderToStaticMarkup(<SlideView deck={engine.deck} slide={engine.deck.slides[0]!} mode="export" />);
    expect(html).toContain('data-el="e-code"');
    expect(html).toContain('data-el="e-code.1"');
  });
});
