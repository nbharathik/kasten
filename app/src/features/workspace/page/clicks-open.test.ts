import { describe, expect, it, vi } from "vitest";

import type { LinkProvider } from "../../pages/editor/links";
import { clicksOpen } from "./page-links";

const provider = (): LinkProvider => ({ pages: () => [], open: vi.fn(), openBoard: vi.fn() });

describe("clicksOpen", () => {
  it("sends a plain click where it is told, and leaves the rest as asked", () => {
    const links = provider();
    const card = clicksOpen(links, "tab");
    card.open("Plan");
    card.open("Plan", "here");
    card.open("Plan", "stack");
    card.open("Plan", "split");
    card.openBoard!("boards/map.canvas", "here");
    expect(vi.mocked(links.open).mock.calls.map(([, how]) => how)).toEqual(["tab", "tab", "stack", "split"]);
    expect(links.openBoard).toHaveBeenCalledWith("boards/map.canvas", "tab");
    // What the provider cannot do, the result cannot either.
    expect(card.openFile).toBeUndefined();
    expect(card.openDatabase).toBeUndefined();
  });

  it("is the provider itself when clicks stay here", () => {
    const links = provider();
    expect(clicksOpen(links, "here")).toBe(links);
  });
});
