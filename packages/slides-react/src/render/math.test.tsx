// @vitest-environment node

import type { Element } from "@kasten-slides/wasm";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { pointsToUnits } from "../units.ts";
import { hasFormula, mathSize, renderMath } from "./math.ts";
import { SlideView } from "./SlideView.tsx";
import { box, scene } from "./testing/decks.ts";
import { draw, elementsOf, styleOf } from "./testing/dom.ts";

vi.mock("../text/TextBlock.tsx", () => import("./testing/mock-text-block.tsx"));

const formula = (extra: Partial<Element> = {}): Element => ({ type: "math", id: "e", latex: "E = mc^2", ...box(100, 50, 400, 120), ...extra }) as Element;

async function drawn(element: Element, mode: "edit" | "present" | "thumbnail" | "export" = "present", theme = "Light") {
  const { deck, slide } = await scene("blank", [element], { theme });
  const page = draw(<SlideView deck={deck} slide={slide} mode={mode} />);
  return { page, deck, slide, el: elementsOf(page).get("e") };
}

describe("a formula", () => {
  it("is KaTeX's markup in the element's box, not the parts of an expansion", async () => {
    const { el, page } = await drawn(formula());
    expect(el?.getAttribute("data-type")).toBe("math");
    expect(styleOf(el)).toMatchObject({ left: "100px", top: "50px", width: "400px", height: "120px" });
    expect(el?.querySelector(".ks-math .katex")).not.toBeNull();
    expect(el?.querySelector(".katex-html")).not.toBeNull();
    // The parts a composite expands to are named after it: there are none.
    expect(page.querySelector('[data-el^="e."]')).toBeNull();
  });

  it("is set in a line of its own, unless it is inline", async () => {
    expect((await drawn(formula())).el?.querySelector(".katex-display")).not.toBeNull();
    const inline = await drawn(formula({ inline: true }));
    expect(inline.el?.querySelector(".katex-display")).toBeNull();
    expect(inline.el?.querySelector(".ks-math")?.getAttribute("data-inline")).toBe("true");
  });

  it("is 32 points, or the size the element names", async () => {
    expect(styleOf((await drawn(formula())).el?.querySelector(".ks-math"))["font-size"]).toBe(`${pointsToUnits(32)}px`);
    expect(styleOf((await drawn(formula({ fontSize: 20 }))).el?.querySelector(".ks-math"))["font-size"]).toBe(`${pointsToUnits(20)}px`);
    expect(mathSize(null)).toBe(pointsToUnits(32));
    expect(mathSize(0)).toBe(pointsToUnits(32));
    expect(mathSize(Number.NaN)).toBe(pointsToUnits(32));
  });

  it("takes its colour from the theme: the text colour, a token, or a hex value", async () => {
    const colorOfFormula = async (extra: Partial<Element>, theme = "Light") => styleOf((await drawn(formula(extra), "present", theme)).el?.querySelector(".ks-math")).color;
    const light = await drawn(formula());
    const text1 = light.deck.theme.colors.text1;
    const accent2 = light.deck.theme.colors.accent2;
    expect(await colorOfFormula({})).toBe(text1);
    expect(await colorOfFormula({ color: "accent2" })).toBe(accent2);
    expect(await colorOfFormula({ color: "#FF0000" })).toBe("#ff0000");
    // A theme change restyles it: the Dark theme's text colour is not the Light theme's.
    const dark = await drawn(formula(), "present", "Dark");
    expect(styleOf(dark.el?.querySelector(".ks-math")).color).toBe(dark.deck.theme.colors.text1);
    expect(dark.deck.theme.colors.text1).not.toBe(text1);
  });

  it("says what it is to a screen reader: the MathML KaTeX adds, or the alt text", async () => {
    const plain = await drawn(formula());
    expect(plain.el?.querySelector("math")).not.toBeNull();
    const described = await drawn(formula({ alt: "Einstein's formula" }));
    const box = described.el?.querySelector(".ks-math");
    expect(box?.getAttribute("role")).toBe("img");
    expect(box?.getAttribute("aria-label")).toBe("Einstein's formula");
  });

  it("is the same in a thumbnail, in present mode and in an export", async () => {
    for (const mode of ["edit", "thumbnail", "present", "export"] as const) {
      expect((await drawn(formula(), mode)).el?.querySelector(".katex"), mode).not.toBeNull();
    }
  });

  it("works where there is no browser: it is markup, so it renders to a string", async () => {
    const { deck, slide } = await scene("blank", [formula({ latex: "\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}" })]);
    const html = renderToStaticMarkup(<SlideView deck={deck} slide={slide} mode="export" />);
    expect(html).toContain('class="katex"');
    expect(html).toContain("katex-html");
  });
});

describe("LaTeX that cannot be read", () => {
  it("shows its source in a red box, with what is wrong as hover text, and does not throw", async () => {
    const { el } = await drawn(formula({ latex: "\\frac{1}{" }));
    const bad = el?.querySelector(".ks-math-error");
    expect(bad?.textContent).toBe("\\frac{1}{");
    expect(bad?.getAttribute("title")).toMatch(/\S/);
    expect(bad?.getAttribute("title")).not.toMatch(/^KaTeX parse error/);
    expect(bad?.getAttribute("role")).toBe("img");
    expect(el?.querySelector(".katex")).toBeNull();
  });

  it("is also what an unknown command becomes, and it does not stop the rest of the slide", async () => {
    const { deck, slide } = await scene("blank", [formula({ latex: "\\notacommand{x}" }), { type: "shape", id: "s", shape: "rect", ...box(0, 0, 10, 10) } as Element]);
    const page = draw(<SlideView deck={deck} slide={slide} mode="present" />);
    expect(elementsOf(page).get("e")?.querySelector(".ks-math-error")).not.toBeNull();
    expect(elementsOf(page).get("s")).toBeDefined();
  });

  it("does not follow links or load pictures, which KaTeX would with trust on", () => {
    const rendered = renderMath("\\href{https://example.com}{x}", true);
    expect(rendered.ok ? rendered.html : "").not.toContain("<a ");
    const picture = renderMath("\\includegraphics{https://example.com/a.png}", true);
    expect(picture.ok ? picture.html : "").not.toContain("<img");
  });

  it("does not let a formula cover the slide: sizes are capped", () => {
    const huge = renderMath("\\rule{9999em}{9999em}", true, "html");
    const html = huge.ok ? huge.html : "";
    expect(html).toContain("height:20em");
    expect(html).not.toContain("height:9999em");
  });
});

describe("an empty formula", () => {
  it("is a dashed prompt in the editor, so that there is something to select, and nothing anywhere else", async () => {
    expect((await drawn(formula({ latex: "" }), "edit")).el?.querySelector(".ks-math-empty")?.textContent).toBe("Formula");
    expect((await drawn(formula({ latex: "  \n" }), "edit")).el?.querySelector(".ks-math-empty")).not.toBeNull();
    for (const mode of ["present", "thumbnail", "export"] as const) {
      const { el } = await drawn(formula({ latex: "" }), mode);
      expect(el?.querySelector(".ks-math-empty"), mode).toBeNull();
      expect(el?.querySelector(".ks-math"), mode).toBeNull();
    }
    expect(hasFormula("x")).toBe(true);
    expect(hasFormula(" ")).toBe(false);
  });
});

describe("rendering a formula once", () => {
  it("keeps what it made for the same LaTeX in the same mode", () => {
    const a = renderMath("x^{2} + y^{2}", false);
    expect(renderMath("x^{2} + y^{2}", false)).toBe(a);
    expect(renderMath("x^{2} + y^{2}", true)).not.toBe(a);
    expect(renderMath("x^{2} + y^{2}", false, "html")).not.toBe(a);
  });

  it("leaves the MathML out when only a picture is wanted", () => {
    const both = renderMath("a+b", false);
    const html = renderMath("a+b", false, "html");
    expect(both.ok && both.html.includes("<math")).toBe(true);
    expect(html.ok && html.html.includes("<math")).toBe(false);
  });

  it("stays bounded: many formulas do not fill the memory", () => {
    for (let n = 0; n < 700; n++) renderMath(`x_{${n}}`, true);
    // The earliest are made again, and are still right.
    const first = renderMath("x_{0}", true);
    expect(first.ok).toBe(true);
  });
});
