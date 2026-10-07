import type { Deck, Slide } from "@kasten-slides/wasm";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { plainDeck } from "../render/testing/decks.ts";
import { ScrollView } from "./ScrollView.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const slide = (id: string, extra: Partial<Slide> = {}): Slide => ({ id, layout: "blank", elements: [], ...extra });
const deckOf = (...slides: Slide[]): Deck => ({ ...plainDeck([]).deck, title: "The talk", slides });

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const render = (ui: React.ReactElement) => act(async () => root.render(ui));

describe("the deck as a page that scrolls", () => {
  const deck = deckOf(slide("a", { notes: "**Open** with a story" }), slide("h", { hidden: true, notes: "never seen" }), slide("b", { steps: 2 }), slide("b2", { backup: true, notes: "- extra" }));

  it("has every slide that is shown, in order, with its number, and none that is hidden", async () => {
    await render(<ScrollView deck={deck} imageUrl={() => undefined} />);
    expect([...host.querySelectorAll(".ks-show-scroll-item")].map((item) => item.getAttribute("data-slide"))).toEqual(["a", "b", "b2"]);
    expect([...host.querySelectorAll(".ks-show-scroll-label")].map((label) => label.textContent)).toEqual(["Slide 1", "Slide 2", "Slide 3Backup"]);
    expect(host.querySelector("h1")?.textContent).toBe("The talk");
    expect(host.textContent).toContain("3 slides");
    expect(host.textContent).not.toContain("never seen");
  });

  it("puts the speaker notes under their slide, as Markdown", async () => {
    await render(<ScrollView deck={deck} imageUrl={() => undefined} />);
    const first = host.querySelector('[data-slide="a"]');
    expect(first?.querySelector(".ks-show-notes strong")?.textContent).toBe("Open");
    expect(host.querySelector('[data-slide="b2"] li')?.textContent).toBe("extra");
    expect(host.querySelector('[data-slide="b"] .ks-show-notes')).toBeNull();
  });

  it("draws each slide as it ends", async () => {
    const shape = (id: string, until: number) => ({ type: "shape", id, shape: "rect", x: 0, y: 0, w: 10, h: 10, stepStates: { 0: "hidden", [until]: "normal" } }) as never;
    const stepped = deckOf(slide("s", { steps: 2, elements: [shape("late", 2)] }));
    await render(<ScrollView deck={stepped} imageUrl={() => undefined} />);
    expect(host.querySelector('[data-el="late"]')).not.toBeNull();
  });

  it("leaves with a button and with Esc when it can leave", async () => {
    const onExit = vi.fn();
    await render(<ScrollView deck={deck} imageUrl={() => undefined} onExit={onExit} />);
    expect(host.querySelector(".ks-show-scroll")?.classList.contains("is-overlay")).toBe(true);
    host.querySelector<HTMLButtonElement>(".ks-show-scroll-close")?.click();
    await act(async () => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(onExit).toHaveBeenCalledTimes(2);
  });

  it("has no button when it cannot leave", async () => {
    await render(<ScrollView deck={deck} imageUrl={() => undefined} />);
    expect(host.querySelector(".ks-show-scroll-close")).toBeNull();
  });
});
