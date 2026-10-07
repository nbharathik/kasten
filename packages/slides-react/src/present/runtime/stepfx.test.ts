import { afterEach, describe, expect, it, vi } from "vitest";

import { EFFECT_SECONDS, newcomers, playEnter, uncovered } from "./stepfx.js";

const element = (): HTMLElement => {
  const node = document.createElement("div");
  node.animate = vi.fn() as unknown as typeof node.animate;
  return node;
};

afterEach(() => vi.unstubAllGlobals());

describe("what a step brings in", () => {
  it("comes in by the effect the deck names, from where the effect begins and to the element's own look", () => {
    const [a, b, c] = [element(), element(), element()];
    playEnter([a], "fade");
    playEnter([b], "fadeUp");
    playEnter([c], "grow");
    expect(a.animate).toHaveBeenCalledWith([{ opacity: 0 }], { duration: EFFECT_SECONDS * 1000, easing: "ease-out", fill: "backwards" });
    expect(b.animate).toHaveBeenCalledWith([{ opacity: 0, translate: "0 24px" }], expect.objectContaining({ duration: 300 }));
    expect(c.animate).toHaveBeenCalledWith([{ opacity: 0, scale: 0.85 }], expect.objectContaining({ duration: 300 }));
  });

  it("takes the time the deck gives", () => {
    const a = element();
    playEnter([a], "fade", 1.5);
    expect(a.animate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ duration: 1500 }));
  });

  it("does nothing for no effect, an effect it does not know, or no time", () => {
    const a = element();
    playEnter([a], "none");
    playEnter([a], "spin");
    playEnter([a], undefined);
    playEnter([a], "fade", 0);
    expect(a.animate).not.toHaveBeenCalled();
  });

  it("does nothing for a person who asked for less movement", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
    const a = element();
    playEnter([a], "fade");
    expect(a.animate).not.toHaveBeenCalled();
  });

  it("is not stopped by an element the browser will not animate", () => {
    const bad = element();
    (bad.animate as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("no");
    });
    const good = element();
    expect(() => playEnter([bad, good], "fade")).not.toThrow();
    expect(good.animate).toHaveBeenCalled();
    const plain = document.createElement("div");
    expect(() => playEnter([plain], "fade")).not.toThrow();
  });
});

describe("which elements are new", () => {
  it("are the ones not there the time before; the first time only learns", () => {
    const [a, b, c] = [element(), element(), element()];
    const fresh = newcomers<HTMLElement>();
    expect(fresh([a, b])).toEqual([]);
    expect(fresh([a, b, c])).toEqual([c]);
    expect(fresh([a, c])).toEqual([]);
    expect(fresh([a, b, c])).toEqual([b]);
  });

  it("can be told apart by a name, for a page that draws its slides again", () => {
    const named = (id: string) => Object.assign(element(), { id });
    const fresh = newcomers<HTMLElement>((node) => node.id);
    fresh([named("one")]);
    expect(fresh([named("one"), named("two")]).map((node) => node.id)).toEqual(["two"]);
  });
});

describe("which paragraphs a step uncovers", () => {
  const paragraph = (hidden: boolean): HTMLElement => {
    const node = document.createElement("div");
    if (hidden) node.style.visibility = "hidden";
    return node;
  };

  it("are the ones that were hidden and are not now", () => {
    const [a, b, c] = [paragraph(false), paragraph(true), paragraph(true)];
    const opened = uncovered<HTMLElement>();
    expect(opened([a, b, c])).toEqual([]);
    b.style.visibility = "";
    expect(opened([a, b, c])).toEqual([b]);
    c.style.visibility = "";
    expect(opened([a, b, c])).toEqual([c]);
    expect(opened([a, b, c])).toEqual([]);
  });

  it("are not the ones that were shown and are hidden again", () => {
    const a = paragraph(false);
    const opened = uncovered<HTMLElement>();
    opened([a]);
    a.style.visibility = "hidden";
    expect(opened([a])).toEqual([]);
    a.style.visibility = "";
    expect(opened([a])).toEqual([a]);
  });
});
