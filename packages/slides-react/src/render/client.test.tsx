import type { Element } from "@kasten-slides/wasm";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SlideView } from "./SlideView.tsx";
import { box, plainDeck, words } from "./testing/decks.ts";

const drawn = vi.hoisted(() => vi.fn<(words: string) => void>());

vi.mock("../text/TextBlock.tsx", () => ({
  TextBlock: ({ text }: { text: { paragraphs: { runs: { t: string }[] }[] } }) => {
    const words = text.paragraphs.map((p) => p.runs.map((r) => r.t).join("")).join(" ");
    drawn(words);
    return <span>{words}</span>;
  },
}));

afterEach(() => {
  cleanup();
  drawn.mockClear();
});

const image = (src: string): Element => ({ type: "image", id: "pic", src, ...box(0, 0, 200, 100) }) as Element;
const note = (id: string, t: string): Element => ({ type: "text", id, ...box(0, 0, 100, 40), text: words(t) }) as Element;

describe("a picture that fails to load", () => {
  it("becomes a grey box, and is tried again for another address", () => {
    const { deck, slide } = plainDeck([image("assets/a.png")]);
    const view = render(<SlideView deck={deck} slide={slide} imageUrl={(src) => `blob:${src}`} />);
    fireEvent.error(view.container.querySelector("img.ks-image-pic") as HTMLImageElement);
    expect(view.container.querySelector("img.ks-image-pic")).toBeNull();
    expect(view.container.querySelector(".ks-image-failed")).not.toBeNull();

    view.rerender(<SlideView deck={deck} slide={slide} imageUrl={(src) => `blob:v2/${src}`} />);
    expect(view.container.querySelector("img.ks-image-pic")?.getAttribute("src")).toBe("blob:v2/assets/a.png");
    expect(view.container.querySelector(".ks-image-failed")).toBeNull();
  });

  it("stays a grey box across redraws for the same address", () => {
    const { deck, slide } = plainDeck([image("assets/a.png")]);
    const imageUrl = (src: string) => `blob:${src}`;
    const view = render(<SlideView deck={deck} slide={slide} imageUrl={imageUrl} />);
    fireEvent.error(view.container.querySelector("img.ks-image-pic") as HTMLImageElement);
    view.rerender(<SlideView deck={deck} slide={slide} imageUrl={imageUrl} className="again" />);
    expect(view.container.querySelector(".ks-image-failed")).not.toBeNull();
  });

  it("is a grey box for a preview of raw content that fails, and then the labelled box", () => {
    const raw = { type: "raw", id: "raw", original: "pptx:chart", preview: "assets/p.png", ...box(0, 0, 100, 50) } as Element;
    const { deck, slide } = plainDeck([raw]);
    const view = render(<SlideView deck={deck} slide={slide} imageUrl={(src) => `blob:${src}`} />);
    fireEvent.error(view.container.querySelector("img.ks-image-pic") as HTMLImageElement);
    expect(view.container.querySelector(".ks-raw")?.textContent).toBe("pptx:chart");
  });
});

describe("drawing again", () => {
  it("draws only the elements that changed", () => {
    const { deck, slide } = plainDeck([note("a", "first"), note("b", "second")]);
    const view = render(<SlideView deck={deck} slide={slide} />);
    expect(drawn.mock.calls.map(([w]) => w).sort()).toEqual(["first", "second"]);
    drawn.mockClear();

    // The engine hands over a new copy of a slide it touched; the same content draws nothing again.
    const copy = structuredClone(slide);
    view.rerender(<SlideView deck={{ ...deck, slides: [copy] }} slide={copy} />);
    expect(drawn).not.toHaveBeenCalled();

    const edited = { ...copy, elements: [copy.elements[0] as Element, note("b", "changed")] };
    view.rerender(<SlideView deck={{ ...deck, slides: [edited] }} slide={edited} />);
    expect(drawn.mock.calls.map(([w]) => w)).toEqual(["changed"]);
  });

  it("draws every element again when the theme changes", () => {
    const { deck, slide } = plainDeck([note("a", "first"), note("b", "second")]);
    const view = render(<SlideView deck={deck} slide={slide} />);
    drawn.mockClear();
    view.rerender(<SlideView deck={{ ...deck, theme: { ...deck.theme, name: "Other" } }} slide={slide} />);
    expect(drawn).toHaveBeenCalledTimes(2);
  });

  it("draws again, when the step changes, only the elements that step changes; and only the one whose text is hidden when that changes", () => {
    const { deck, slide } = plainDeck([note("a", "first"), { ...note("b", "second"), stepStates: { 0: "hidden", 1: "normal" } } as Element]);
    const view = render(<SlideView deck={deck} slide={slide} step={0} />);
    expect(drawn.mock.calls.map(([w]) => w)).toEqual(["first"]);
    drawn.mockClear();
    view.rerender(<SlideView deck={deck} slide={slide} step={1} />);
    expect(drawn.mock.calls.map(([w]) => w)).toEqual(["second"]);
    drawn.mockClear();
    view.rerender(<SlideView deck={deck} slide={slide} step={1} hideTextOf="a" />);
    expect(drawn).not.toHaveBeenCalled();
    expect(view.container.textContent).toBe("second");
    view.rerender(<SlideView deck={deck} slide={slide} step={1} hideTextOf="b" />);
    expect(view.container.textContent).toBe("first");
    expect(drawn).toHaveBeenCalledTimes(1);
  });
});

describe("drawing every kind of element on a page", () => {
  it("makes no complaint to the console about keys or nesting", () => {
    const complaints = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cell = (t: string) => ({ text: words(t) });
    const everything = [
      note("text", "a text box"),
      { type: "shape", id: "shape", shape: "wedgeRoundRectCallout", ...box(0, 50, 120, 60), text: words("callout"), style: { fill: { color: "accent1" }, stroke: { color: "text1", width: 2, dash: "dash" } } },
      { type: "line", id: "line", ...box(0, 120, 100, 0), style: { stroke: { color: "text1", width: 3 }, startArrow: "oval", endArrow: "stealth" } },
      { type: "connector", id: "connector", route: "curved", ...box(0, 140, 100, 40), label: words("label") },
      image("assets/a.png"),
      { type: "table", id: "table", ...box(0, 200, 200, 60), columns: [100, 100], headerRow: true, rows: [{ cells: [cell("a"), cell("b")] }, { cells: [cell("c"), cell("d")] }] },
      { type: "group", id: "group", children: [note("inner", "in a group")] },
      { type: "raw", id: "raw", original: "pptx:chart", ...box(0, 300, 50, 50) },
    ] as Element[];
    const { deck, slide } = plainDeck(everything);
    const view = render(<SlideView deck={deck} slide={slide} mode="edit" imageUrl={(src) => `blob:${src}`} step={1} />);
    expect(view.container.querySelectorAll("[data-el]")).toHaveLength(9);
    expect(complaints).not.toHaveBeenCalled();
    complaints.mockRestore();
  });
});
