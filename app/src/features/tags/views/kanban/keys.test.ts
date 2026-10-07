import { describe, expect, it } from "vitest";

import { cardKey } from "./keys";

const press = (key: string, mods: Partial<Record<"altKey" | "ctrlKey" | "metaKey" | "shiftKey", boolean>> = {}) =>
  cardKey({ key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...mods });

describe("kanban card keys", () => {
  it("opens with Enter or Space, whatever the modifiers (they say where)", () => {
    expect(press("Enter")).toEqual({ kind: "open" });
    expect(press("Enter", { ctrlKey: true })).toEqual({ kind: "open" });
    expect(press(" ")).toEqual({ kind: "open" });
  });

  it("moves with Alt+← and Alt+→ only", () => {
    expect(press("ArrowRight", { altKey: true })).toEqual({ kind: "move", step: 1 });
    expect(press("ArrowLeft", { altKey: true })).toEqual({ kind: "move", step: -1 });
    expect(press("ArrowUp", { altKey: true })).toBeNull();
    expect(press("ArrowRight", { altKey: true, shiftKey: true })).toBeNull();
    expect(press("ArrowRight", { altKey: true, ctrlKey: true })).toBeNull();
  });

  it("goes from card to card with the bare arrows, and leaves other keys alone", () => {
    expect(press("ArrowDown")).toEqual({ kind: "focus", dir: "down" });
    expect(press("ArrowLeft")).toEqual({ kind: "focus", dir: "left" });
    expect(press("ArrowDown", { shiftKey: true })).toBeNull();
    expect(press("ArrowLeft", { metaKey: true })).toBeNull();
    expect(press("k")).toBeNull();
    expect(press("Escape")).toBeNull();
  });
});
