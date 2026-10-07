// @vitest-environment node

import type { Element } from "@kasten-slides/wasm";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { SlideView } from "../render/SlideView.tsx";
import { plainDeck } from "../render/testing/decks.ts";

const shape = (id: string, extra: Record<string, unknown> = {}) => ({ type: "shape", id, shape: "rect", x: 0, y: 0, w: 10, h: 10, ...extra }) as unknown as Element;

describe("what Morph pairs elements by", () => {
  const { deck, slide } = plainDeck([shape("plain"), shape("named", { morphId: "shared" }), { type: "group", id: "g", children: [shape("inner")] } as unknown as Element]);
  const ids = (mode: "present" | "edit" | "thumbnail" | "export") => [...renderToStaticMarkup(<SlideView deck={deck} slide={slide} mode={mode} />).matchAll(/data-el="([^"]+)"[^>]*?(?:data-id="([^"]+)")?/g)].map((m) => `${m[1]}:${m[2] ?? ""}`);

  it("is the element's id, or its morphId when it has one, on a slide that is presented", () => {
    const html = renderToStaticMarkup(<SlideView deck={deck} slide={slide} mode="present" />);
    expect(html).toContain('data-el="plain" data-id="plain"');
    expect(html).toContain('data-el="named" data-id="shared"');
    expect(html).toContain('data-el="inner" data-id="inner"');
    expect(html).toContain('data-el="g" data-id="g"');
  });

  it("is not there for an editor, a thumbnail or an export, where nothing morphs", () => {
    for (const mode of ["edit", "thumbnail", "export"] as const) expect(renderToStaticMarkup(<SlideView deck={deck} slide={slide} mode={mode} />), mode).not.toContain("data-id=");
    void ids;
  });
});
