import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { animateMorph, matchSlides } from "./morph.js";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Recorded {
  target: HTMLElement;
  frames: Record<string, unknown[]>;
  options: Record<string, unknown>;
}

let recorded: Recorded[] = [];
/** What each animation does when it ends, by the element it is on. */
const finishing = new Map<Element, () => void>();

// jsdom lays nothing out, and animates nothing: an element's box is what its data says, and an animation is written down.
beforeEach(() => {
  for (const [property, key] of [["offsetLeft", "x"], ["offsetTop", "y"], ["offsetWidth", "w"], ["offsetHeight", "h"]] as const) {
    Object.defineProperty(HTMLElement.prototype, property, { configurable: true, get(this: HTMLElement) { return Number(this.dataset[key] ?? 0); } });
  }
  recorded = [];
  finishing.clear();
  Object.defineProperty(Element.prototype, "animate", {
    configurable: true,
    writable: true,
    value(this: HTMLElement, frames: Record<string, unknown[]>, options: Record<string, unknown>) {
      recorded.push({ target: this, frames, options });
      return { addEventListener: (type: string, done: () => void) => void (type === "finish" && finishing.set(this, done)) };
    },
  });
  document.body.innerHTML = "";
});

afterEach(() => {
  delete (Element.prototype as { animate?: unknown }).animate;
  vi.unstubAllGlobals();
});

interface Made {
  slide: HTMLElement;
  stage: HTMLElement;
  /** The animations that are on this slide's elements. */
  readonly animations: Recorded[];
}

function slide(elements: { id: string; box: Box; type?: string; text?: string; opacity?: number; children?: string }[], extra: Record<string, string> = {}): Made {
  const section = document.createElement("section");
  for (const [name, value] of Object.entries(extra)) section.setAttribute(name, value);
  const stage = document.createElement("div");
  stage.className = "ks-slide";
  stage.style.backgroundColor = "rgb(255, 255, 255)";
  for (const { id, box, type = "shape", text = "", opacity = 1, children = "" } of elements) {
    const node = document.createElement("div");
    node.setAttribute("data-id", id);
    node.setAttribute("data-el", id);
    node.setAttribute("data-type", type);
    node.dataset.x = String(box.x);
    node.dataset.y = String(box.y);
    node.dataset.w = String(box.w);
    node.dataset.h = String(box.h);
    node.style.opacity = String(opacity);
    node.innerHTML = `${text}${children}`;
    stage.append(node);
  }
  section.append(stage);
  document.body.append(section);
  return {
    slide: section,
    stage,
    get animations() {
      return recorded.filter((a) => section.contains(a.target));
    },
  };
}

const run = (from: Made, to: Made) => {
  matchSlides(from.slide, to.slide);
  animateMorph({ fromSlide: from.slide, toSlide: to.slide });
};

const framesOf = (made: Made, id: string) => made.animations.find((a) => a.target.getAttribute("data-id") === id)?.frames;

describe("which elements are the same thing", () => {
  it("are paired by data-id, in order when an id is on several, and reveal.js is left to animate none of them", () => {
    const a = slide([{ id: "x", box: { x: 0, y: 0, w: 1, h: 1 } }, { id: "x", box: { x: 5, y: 5, w: 1, h: 1 } }, { id: "gone", box: { x: 0, y: 0, w: 1, h: 1 } }]);
    const b = slide([{ id: "x", box: { x: 9, y: 9, w: 1, h: 1 } }, { id: "x", box: { x: 8, y: 8, w: 1, h: 1 } }, { id: "new", box: { x: 0, y: 0, w: 1, h: 1 } }]);
    const pairs = matchSlides(a.slide, b.slide);
    expect(pairs).toHaveLength(2);
    expect(pairs[0]?.from).toBe(a.stage.children[0]);
    expect(pairs[0]?.to).toBe(b.stage.children[0]);
    expect(pairs[1]?.from).toBe(a.stage.children[1]);
    expect(pairs[0]?.options).toEqual({ translate: false, scale: false, styles: [] });
  });
});

describe("the morph between two slides", () => {
  it("moves an element from where its pair was: about its centre, over the time and by the easing of the slide that morphs", () => {
    const from = slide([{ id: "card", box: { x: 100, y: 100, w: 200, h: 100 } }]);
    const to = slide([{ id: "card", box: { x: 400, y: 300, w: 400, h: 200 } }], { "data-auto-animate-duration": "0.8", "data-auto-animate-easing": "ease-in-out" });
    run(from, to);
    const move = to.animations.find((a) => a.target.getAttribute("data-id") === "card");
    // The centre was at (200, 150) and is at (600, 400); the box was half the size.
    expect(move?.frames).toEqual({ translate: ["-400px -250px", "0px 0px"], scale: ["0.5 0.5", "1 1"] });
    expect(move?.options).toEqual({ duration: 800, easing: "ease-in-out", fill: "backwards" });
  });

  it("takes the time from the later slide when the person goes back", () => {
    const earlier = slide([{ id: "card", box: { x: 50, y: 0, w: 10, h: 10 } }]);
    const later = slide([{ id: "card", box: { x: 0, y: 0, w: 10, h: 10 } }], { "data-auto-animate-duration": "1.5" });
    // Going back, the later slide is the one left, and the earlier the one arrived at.
    run(later, earlier);
    expect(earlier.animations.find((a) => a.target.getAttribute("data-id") === "card")?.options).toMatchObject({ duration: 1500 });
  });

  it("takes 0.6 seconds and the easing 'ease' when nothing says", () => {
    const from = slide([{ id: "a", box: { x: 0, y: 0, w: 10, h: 10 } }]);
    const to = slide([{ id: "a", box: { x: 20, y: 0, w: 10, h: 10 } }]);
    run(from, to);
    expect(to.animations[0]?.options).toMatchObject({ duration: 600, easing: "ease" });
  });

  it("does not stretch words: a text box that changes shape scales evenly", () => {
    const from = slide([{ id: "t", type: "text", text: "Title", box: { x: 0, y: 0, w: 400, h: 100 } }]);
    const to = slide([{ id: "t", type: "text", text: "Title", box: { x: 0, y: 0, w: 100, h: 100 } }]);
    run(from, to);
    const scale = framesOf(to, "t")?.scale?.[0] as string;
    const [x, y] = scale.split(" ").map(Number);
    expect(x).toBeCloseTo(y as number, 5);
    expect(x).toBeCloseTo(2, 5);
  });

  it("fades in what is new, a little late, and leaves alone what has not moved", () => {
    const from = slide([{ id: "still", box: { x: 0, y: 0, w: 10, h: 10 } }]);
    const to = slide([{ id: "still", box: { x: 0, y: 0, w: 10, h: 10 } }, { id: "fresh", box: { x: 0, y: 0, w: 10, h: 10 } }]);
    run(from, to);
    expect(framesOf(to, "still")).toBeUndefined();
    expect(to.animations.find((a) => a.target.getAttribute("data-id") === "fresh")).toMatchObject({ frames: { opacity: [0, 1] }, options: { duration: 480, delay: 120, fill: "backwards" } });
  });

  it("keeps what is gone on the slide for a moment, fading out, and then takes it away", () => {
    const from = slide([{ id: "old", box: { x: 10, y: 10, w: 50, h: 50 }, text: "bye" }]);
    const to = slide([{ id: "other", box: { x: 0, y: 0, w: 10, h: 10 } }]);
    const before = to.stage.children.length;
    run(from, to);
    expect(to.stage.children.length).toBe(before + 1);
    const ghost = to.stage.lastElementChild as HTMLElement;
    expect(ghost.getAttribute("aria-hidden")).toBe("true");
    expect(ghost.hasAttribute("data-id")).toBe(false);
    expect(ghost.hasAttribute("data-el")).toBe(false);
    expect(recorded.find((a) => a.target === ghost)).toMatchObject({ frames: { opacity: [1, 0] }, options: { duration: 480, fill: "forwards" } });
    finishing.get(ghost)?.();
    expect(to.stage.children.length).toBe(before);
  });

  it("does not put a group and what is in it through the change twice", () => {
    const from = slide([{ id: "g", type: "group", box: { x: 0, y: 0, w: 960, h: 540 } }]);
    const to = slide([{ id: "n", box: { x: 0, y: 0, w: 10, h: 10 } }]);
    // A group that is gone with a child of it that is gone too: one ghost, not two.
    from.stage.firstElementChild?.append(Object.assign(document.createElement("div"), { innerHTML: "" }));
    const child = document.createElement("div");
    child.setAttribute("data-id", "child");
    from.stage.firstElementChild?.append(child);
    matchSlides(from.slide, to.slide);
    const before = to.stage.children.length;
    animateMorph({ fromSlide: from.slide, toSlide: to.slide });
    expect(to.stage.children.length - before).toBe(1);
  });

  it("puts the words of a text that changed across: the old ones go the way the box goes, and fade", () => {
    const from = slide([{ id: "t", type: "text", text: "Before", box: { x: 0, y: 0, w: 100, h: 50 } }]);
    const to = slide([{ id: "t", type: "text", text: "After", box: { x: 200, y: 0, w: 100, h: 50 } }]);
    matchSlides(from.slide, to.slide);
    animateMorph({ fromSlide: from.slide, toSlide: to.slide });
    // The new words come in from nothing; the old stay as a copy.
    expect(framesOf(to, "t")).toMatchObject({ opacity: [0, 1] });
    expect(to.stage.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1);
    expect(to.stage.querySelector('[aria-hidden="true"]')?.textContent).toBe("Before");
  });

  it("changes the colour of the paper as the elements move", () => {
    const from = slide([{ id: "a", box: { x: 0, y: 0, w: 1, h: 1 } }]);
    const to = slide([{ id: "a", box: { x: 5, y: 0, w: 1, h: 1 } }]);
    to.stage.style.backgroundColor = "rgb(0, 0, 0)";
    run(from, to);
    expect(to.animations.find((a) => a.target === to.stage)?.frames).toEqual({ backgroundColor: ["rgb(255, 255, 255)", "rgb(0, 0, 0)"] });
  });

  it("does nothing for a person who asked for less movement", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
    const from = slide([{ id: "a", box: { x: 0, y: 0, w: 1, h: 1 } }]);
    const to = slide([{ id: "a", box: { x: 50, y: 0, w: 1, h: 1 } }]);
    run(from, to);
    expect(to.animations).toEqual([]);
    vi.unstubAllGlobals();
  });
});
