import type { Element } from "@kasten-slides/wasm";
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

import type { RenderCx } from "./context.ts";
import { SlideView } from "./SlideView.tsx";
import { sameApartFromStep } from "./step-memo.ts";
import { plainDeck, plainTheme } from "./testing/decks.ts";

const drawn: string[] = [];

vi.mock("../text/TextBlock.tsx", () => ({
  TextBlock: (props: { text: { paragraphs: { runs: { t: string }[] }[] } }) => {
    drawn.push(props.text.paragraphs.map((p) => p.runs.map((r) => r.t).join("")).join("/"));
    return null;
  },
}));

const cx = (over: Partial<RenderCx> = {}): RenderCx => ({
  theme: plainTheme(),
  layout: "blank",
  mode: "present",
  step: 0,
  imageUrl: undefined,
  fields: { slideNumber: 1, slideCount: 3 },
  size: { w: 960, h: 540 },
  paper: "#fff",
  master: false,
  ...over,
});

const shape = (extra: Record<string, unknown> = {}): Element => ({ type: "shape", id: "s", shape: "rect", x: 0, y: 0, w: 10, h: 10, ...extra }) as Element;

describe("an element and a step that does not touch it", () => {
  const theme = plainTheme();
  const base = cx({ theme });

  it("is drawn the same at any two steps when it has no states and no paragraphs that build", () => {
    expect(sameApartFromStep({ ...base, step: 1 }, { ...base, step: 4 }, shape())).toBe(true);
  });

  it("is drawn again when a step between the two gives it a state", () => {
    const element = shape({ stepStates: { 0: "hidden", 2: "normal" } });
    expect(sameApartFromStep({ ...base, step: 0 }, { ...base, step: 1 }, element)).toBe(true);
    expect(sameApartFromStep({ ...base, step: 1 }, { ...base, step: 2 }, element)).toBe(false);
    expect(sameApartFromStep({ ...base, step: 2 }, { ...base, step: 1 }, element)).toBe(false);
    expect(sameApartFromStep({ ...base, step: 2 }, { ...base, step: 5 }, element)).toBe(true);
  });

  it("is drawn again when a paragraph of it comes in between the two steps", () => {
    const element = { type: "text", id: "t", x: 0, y: 0, w: 10, h: 10, text: { paragraphs: [{ runs: [{ t: "a" }] }, { runs: [{ t: "b" }], step: 3 }] } } as Element;
    expect(sameApartFromStep({ ...base, step: 1 }, { ...base, step: 2 }, element)).toBe(true);
    expect(sameApartFromStep({ ...base, step: 2 }, { ...base, step: 3 }, element)).toBe(false);
  });

  it("is drawn again if it is a group and something in it changes", () => {
    const group = { type: "group", id: "g", children: [shape({ id: "c", stepStates: { 1: "highlighted" } })] } as Element;
    expect(sameApartFromStep({ ...base, step: 0 }, { ...base, step: 1 }, group)).toBe(false);
    expect(sameApartFromStep({ ...base, step: 1 }, { ...base, step: 2 }, group)).toBe(true);
  });

  it("is drawn again when it says the step label, which the step words", () => {
    const label = { type: "text", id: "l", x: 0, y: 0, w: 10, h: 10, text: { paragraphs: [{ runs: [{ t: "", field: "stepLabel" }] }] } } as Element;
    const at = (step: number) => cx({ theme, step, fields: { slideNumber: 1, slideCount: 3, stepLabel: `Step ${step}` } });
    expect(sameApartFromStep(at(1), at(2), label)).toBe(false);
    expect(sameApartFromStep(at(1), at(2), shape())).toBe(true);
  });

  it("is drawn again when anything else it is drawn with differs", () => {
    const element = shape();
    expect(sameApartFromStep(base, { ...base, mode: "edit" }, element)).toBe(false);
    expect(sameApartFromStep(base, { ...base, theme: { ...theme } }, element)).toBe(false);
    expect(sameApartFromStep(base, { ...base, fields: { slideNumber: 2, slideCount: 3 } }, element)).toBe(false);
    expect(sameApartFromStep(base, { ...base, paper: "#000" }, element)).toBe(false);
  });

  it("is drawn again when steps are switched on or off", () => {
    expect(sameApartFromStep({ ...base, step: undefined }, { ...base, step: 1 }, shape())).toBe(false);
  });
});

describe("a slide taken through its steps", () => {
  it("draws only the elements a step changes", async () => {
    const words = (t: string, extra: Record<string, unknown> = {}) => ({ type: "text", id: t, x: 0, y: 0, w: 100, h: 20, text: { paragraphs: [{ runs: [{ t }] }] }, ...extra }) as Element;
    const { deck, slide } = plainDeck([words("still"), words("second", { stepStates: { 0: "hidden", 1: "normal" } }), words("third", { stepStates: { 0: "hidden", 2: "normal" } }), words("also still")]);
    const host = document.createElement("div");
    const root = createRoot(host);
    const at = async (step: number) => act(async () => root.render(<SlideView deck={deck} slide={slide} step={step} mode="present" />));
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    await at(0);
    expect(drawn.sort()).toEqual(["also still", "still"]);
    drawn.length = 0;
    await at(1);
    expect(drawn).toEqual(["second"]);
    drawn.length = 0;
    await at(2);
    expect(drawn).toEqual(["third"]);
    drawn.length = 0;
    await at(1);
    expect(host.textContent).toBe("");
    await act(async () => root.unmount());
  });
});
