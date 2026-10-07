import { describe, expect, it } from "vitest";

import { historyLabel, stepName } from "./history-label.ts";

describe("naming a step of history", () => {
  it("turns the engine's operation names into words", () => {
    expect(stepName("transform_elements")).toBe("Move elements");
    expect(stepName("add_slide")).toBe("Add slide");
    expect(stepName("set_rich_text")).toBe("Format text");
    expect(historyLabel("Undo", "patch_elements")).toBe("Undo Change elements");
    expect(historyLabel("Redo", "group_elements")).toBe("Redo Group");
  });

  it("names an import, alone or with the steps it collapses", () => {
    expect(stepName("add_slides")).toBe("Import slides");
    expect(stepName("replace_deck, collapse_slides")).toBe("Import slides");
    expect(historyLabel("Undo", "add_slides, collapse_slides")).toBe("Undo Import slides");
    expect(stepName("collapse_slides")).toBe("Collapse slides");
  });

  it("says something for an operation it has no name for, and leaves words alone", () => {
    expect(stepName("flip_the_table")).toBe("Flip the table");
    expect(stepName("Move elements")).toBe("Move elements");
  });

  it("is just the verb when there is no step", () => {
    expect(stepName(undefined)).toBeUndefined();
    expect(stepName("")).toBeUndefined();
    expect(historyLabel("Undo", undefined)).toBe("Undo");
  });
});
