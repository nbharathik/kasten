// @vitest-environment node

import type { Element } from "@kasten-slides/wasm";
import { describe, expect, it, vi } from "vitest";

import { isCover } from "./cover.ts";
import { SlideView } from "./SlideView.tsx";
import { box, scene } from "./testing/decks.ts";
import { draw, elementsOf, styleOf } from "./testing/dom.ts";

vi.mock("../text/TextBlock.tsx", () => import("./testing/mock-text-block.tsx"));

const embed = (extra: Partial<Element> = {}): Element => ({ type: "embed", id: "e", url: "https://example.com", ...box(100, 50, 400, 300), ...extra }) as Element;
const video = (extra: Partial<Element> = {}): Element => ({ type: "video", id: "v", src: "clip.mp4", ...box(100, 50, 400, 225), ...extra }) as Element;

async function drawn(element: Element) {
  const { deck, slide } = await scene("blank", [element]);
  return elementsOf(draw(<SlideView deck={deck} slide={slide} mode="present" imageUrl={(src) => `blob:${src}`} />));
}

describe("the poster of an embedded page or a video", () => {
  it("fills its box without being stretched", async () => {
    const parts = await drawn(embed({ poster: "assets/site.png" }));
    const img = parts.get("e.1")?.querySelector("img");
    expect(img?.getAttribute("src")).toBe("blob:assets/site.png");
    expect(styleOf(img)).toMatchObject({ width: "100%", height: "100%", "object-fit": "cover" });
  });

  it("does so for a video too, with its play button still on top", async () => {
    const parts = await drawn(video({ poster: "assets/still.png" }));
    expect(styleOf(parts.get("v.1")?.querySelector("img"))["object-fit"]).toBe("cover");
    expect(parts.size).toBeGreaterThan(2);
  });

  it("is cropped by the same box whatever the picture's shape, with the corners the element rounds", async () => {
    const parts = await drawn(embed({ poster: "assets/site.png" }));
    expect(styleOf(parts.get("e.1")?.querySelector(".ks-image"))["border-radius"]).toMatch(/px$/);
  });

  it("is a picture like any other picture when it is an image of the slide: stretched, as it always was", async () => {
    const { deck, slide } = await scene("blank", [{ type: "image", id: "i", src: "assets/photo.png", ...box(0, 0, 200, 100) } as Element]);
    const img = elementsOf(draw(<SlideView deck={deck} slide={slide} mode="present" />)).get("i")?.querySelector("img");
    expect(styleOf(img)["object-fit"]).toBeUndefined();
  });

  it("leaves the panel of a page with no poster as it was: there is no picture in it", async () => {
    const parts = await drawn(embed());
    expect(parts.get("e")?.querySelector("img")).toBeNull();
  });
});

describe("a picture that says it covers its box", () => {
  const image = (extra: Record<string, unknown>): Element => ({ type: "image", id: "i", src: "a.png", ...box(0, 0, 10, 10), ...extra }) as unknown as Element;

  it("is a picture with fit cover, and nothing else is", () => {
    expect(isCover(image({ fit: "cover" }))).toBe(true);
    for (const other of [{}, { fit: "contain" }, { fit: "Cover" }, { fit: true }]) expect(isCover(image(other))).toBe(false);
  });

  it("is a picture only: a shape with the mark is not one", () => {
    expect(isCover({ type: "shape", id: "s", shape: "rect", fit: "cover", ...box(0, 0, 5, 5) } as unknown as Element)).toBe(false);
  });

  it("stays a cover when the shapes of a poster are kept by ungrouping it", async () => {
    // The mark is in the deck, so the picture looks the same as a group of shapes as it did as a video.
    const { deck, slide } = await scene("blank", [image({ fit: "cover", src: "assets/still.png", ...box(0, 0, 200, 100) })]);
    const img = elementsOf(draw(<SlideView deck={deck} slide={slide} mode="present" imageUrl={(src) => `blob:${src}`} />)).get("i")?.querySelector("img");
    expect(styleOf(img)["object-fit"]).toBe("cover");
  });
});
