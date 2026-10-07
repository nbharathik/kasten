// @vitest-environment node

import type { StepState } from "@kasten-slides/wasm";
import { describe, expect, it } from "vitest";

import { stateAt } from "./steps.ts";

const at = (states: Record<string, StepState> | undefined, step: number) => stateAt({ stepStates: states as never }, step);

describe("stateAt", () => {
  it("is normal for an element with no states", () => {
    expect(at(undefined, 0)).toBe("normal");
    expect(at({}, 3)).toBe("normal");
  });

  it("is the state of the greatest step that is not after the one asked for", () => {
    const states: Record<string, StepState> = { 1: "hidden", 3: "dimmed", 6: "highlighted" };
    expect(at(states, 1)).toBe("hidden");
    expect(at(states, 2)).toBe("hidden");
    expect(at(states, 3)).toBe("dimmed");
    expect(at(states, 5)).toBe("dimmed");
    expect(at(states, 6)).toBe("highlighted");
    expect(at(states, 40)).toBe("highlighted");
  });

  it("is normal before its first change", () => {
    expect(at({ 2: "hidden" }, 0)).toBe("normal");
    expect(at({ 2: "hidden" }, 1)).toBe("normal");
  });

  it("does not depend on the order the keys are in, or on how many digits they have", () => {
    expect(at({ 10: "dimmed", 2: "hidden", 9: "normal" }, 9)).toBe("normal");
    expect(at({ 10: "dimmed", 2: "hidden", 9: "normal" }, 10)).toBe("dimmed");
    expect(at({ 10: "dimmed", 2: "hidden", 9: "normal" }, 3)).toBe("hidden");
  });

  it("can be told to go back to normal", () => {
    expect(at({ 0: "hidden", 2: "normal" }, 2)).toBe("normal");
  });

  it("ignores a key that is not a step, and a state it does not know", () => {
    expect(at({ soon: "hidden", "": "dimmed", 1: "highlighted" }, 4)).toBe("highlighted");
    expect(at({ 1: "hidden", 2: "sparkling" as StepState }, 3)).toBe("normal");
  });

  it("works from the states of a whole element", () => {
    expect(stateAt({}, 1)).toBe("normal");
  });
});
