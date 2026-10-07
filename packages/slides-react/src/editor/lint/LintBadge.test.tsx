import type { Element } from "@kasten-slides/wasm";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LintBadge, badgeTitle } from "./LintBadge.tsx";
import { type Kit, offEdge, openLinted } from "./test-kit.ts";

let kit: Kit | null = null;
afterEach(() => {
  cleanup();
  kit?.service.dispose();
  void kit?.session.dispose();
  kit = null;
});

async function show(slideAt = 1): Promise<{ k: Kit; slide: string; view: ReturnType<typeof render> }> {
  const k = (kit = await openLinted(2));
  const slide = k.slides[slideAt]!;
  const view = render(<LintBadge lint={k.service} slideId={slide} />);
  act(() => {
    k.clock.settle();
  });
  return { k, slide, view };
}

const put = (k: Kit, slide: string, elements: Element[]) =>
  act(() => {
    k.session.core.apply("add_elements", { slide, elements });
    k.clock.settle();
  });

const badge = (view: ReturnType<typeof render>) => view.container.querySelector<HTMLElement>(".ks-lint-badge");

describe("the badge on a slide in the filmstrip", () => {
  it("is not there for a slide with nothing wrong", async () => {
    const { view } = await show();
    expect(badge(view)).toBeNull();
  });

  it("counts the problems in the colour of the worst, and lists the first in its tooltip", async () => {
    const { k, slide, view } = await show();
    put(k, slide, [offEdge("wide")]);
    const shown = badge(view)!;
    expect(shown.className).toContain("is-error");
    expect(shown.textContent).toBe("1");
    expect(shown.title).toBe('1 problem on this slide\nError: The text box "Off the edge" sticks out past the right edge by 240 units.');
    expect(shown.getAttribute("aria-label")).toBe('1 problem on this slide. Error: The text box "Off the edge" sticks out past the right edge by 240 units.');
  });

  it("lists three problems and says how many more there are", async () => {
    const { k, slide, view } = await show();
    put(k, slide, [offEdge("a"), offEdge("b"), offEdge("c"), offEdge("d")]);
    const shown = badge(view)!;
    expect(shown.textContent).toBe("4");
    const lines = shown.title.split("\n");
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe("4 problems on this slide");
    expect(lines.slice(1, 4).every((line) => line.startsWith("Error: The text box"))).toBe(true);
    expect(lines[4]).toBe("and 1 more");
  });

  it("is amber for a warning, and says nothing of what is only worth a look", async () => {
    const { k, slide, view } = await show();
    put(k, slide, [{ type: "image", id: "pic", src: "assets/x.png", x: 100, y: 300, w: 100, h: 100 } as Element]);
    expect(badge(view), "a missing description is info, which the filmstrip leaves to the dialog").toBeNull();
    put(k, slide, [{ type: "text", id: "tight", x: 4, y: 100, w: 300, h: 60, text: { paragraphs: [{ runs: [{ t: "Close to the edge" }] }] } } as Element]);
    const shown = badge(view)!;
    expect(shown.className).toContain("is-warning");
    expect(shown.title).toMatch(/^1 problem on this slide\nWarning: /);
  });

  it("goes when the problem is put right", async () => {
    const { k, slide, view } = await show();
    put(k, slide, [offEdge()]);
    expect(badge(view)).not.toBeNull();
    act(() => {
      k.session.undo();
      k.clock.settle();
    });
    expect(badge(view)).toBeNull();
  });

  it("cuts a long message in the tooltip", () => {
    const long = "x".repeat(300);
    const title = badgeTitle([{ rule: "overlap", severity: "warning", slide: "s", message: long }]);
    expect(title.split("\n")[1]).toHaveLength("Warning: ".length + 120);
    expect(title.endsWith("…")).toBe(true);
  });
});
