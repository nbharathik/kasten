import { describe, expect, it } from "vitest";

import { readSets, setOf, withSet, withoutSet } from "./tab-sets";
import { focusedPane, initialLayout, openTabs, type Place } from "./tabs";

const page = (path: string): Place => ({ view: "page", path });

describe("tab sets", () => {
  it("saves a pane's tabs, pinned ones pinned, without Home", () => {
    const layout = openTabs(initialLayout(), [page("a.md"), { view: "boards", path: "b.canvas" }], [page("a.md")]);
    const set = setOf(focusedPane(layout), "  Writing   week ")!;
    expect(set.name).toBe("Writing week");
    expect(set.tabs).toEqual([
      { place: page("a.md"), pinned: true },
      { place: { view: "boards", path: "b.canvas" }, pinned: false },
    ]);
    expect(setOf(focusedPane(initialLayout()), "Empty")).toBeNull();
    expect(setOf(focusedPane(layout), " ")).toBeNull();
  });

  it("replaces a set of the same name, removes one, and reads stored ones leniently", () => {
    const one = { name: "Trip", tabs: [{ place: page("a.md"), pinned: false }] };
    const two = { name: "trip", tabs: [{ place: page("b.md"), pinned: true }] };
    expect(withSet([one], two)).toEqual([two]);
    expect(withoutSet([one], "Trip")).toEqual([]);
    expect(readSets([one, { name: 3 }, { name: "Bad", tabs: [{ place: { view: "nope" } }] }, null])).toEqual([one]);
    expect(readSets("x")).toEqual([]);
  });
});
