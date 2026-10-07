import { describe, expect, it } from "vitest";

import { type KeyInfo, bodyLineEdit } from "./lines.ts";

const key = (name: string, extra: Partial<KeyInfo> = {}): KeyInfo => ({ key: name, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...extra });

/** Runs a key on text with `|` standing for the caret; answers the result written the same way, or null. */
function press(k: KeyInfo, text: string): string | null {
  const at = text.indexOf("|");
  const value = text.replace("|", "");
  const edit = bodyLineEdit(k, value, at, at);
  return edit ? `${edit.value.slice(0, edit.start)}|${edit.value.slice(edit.end)}` : null;
}

describe("Enter", () => {
  it("carries a bullet list on to the next line", () => {
    expect(press(key("Enter"), "- one|")).toBe("- one\n- |");
    expect(press(key("Enter"), "- a\n- b|\n- c")).toBe("- a\n- b\n- |\n- c");
    expect(press(key("Enter"), "* star|")).toBe("* star\n* |");
  });

  it("splits a line at the caret", () => {
    expect(press(key("Enter"), "- one|two")).toBe("- one\n- |two");
  });

  it("keeps the level, and counts a numbered list", () => {
    expect(press(key("Enter"), "  - deep|")).toBe("  - deep\n  - |");
    expect(press(key("Enter"), "2. b|")).toBe("2. b\n3. |");
    expect(press(key("Enter"), "9) nine|")).toBe("9) nine\n10) |");
  });

  it("ends the list on an empty item, a level at a time", () => {
    expect(press(key("Enter"), "- a\n- |")).toBe("- a\n|");
    expect(press(key("Enter"), "- a\n  - |")).toBe("- a\n- |");
    expect(press(key("Enter"), "- a\n    - |")).toBe("- a\n  - |");
    expect(press(key("Enter"), "1. |")).toBe("|");
  });

  it("leaves the caret in the marker, other lines, selections and modifiers alone", () => {
    expect(press(key("Enter"), "|- one")).toBeNull();
    expect(press(key("Enter"), "-| one")).toBeNull();
    expect(press(key("Enter"), "plain words|")).toBeNull();
    expect(press(key("Enter"), "")).toBeNull();
    expect(press(key("Enter", { shiftKey: true }), "- one|")).toBeNull();
    expect(press(key("Enter", { ctrlKey: true }), "- one|")).toBeNull();
    expect(press(key("Enter", { metaKey: true }), "- one|")).toBeNull();
    expect(bodyLineEdit(key("Enter"), "- one two", 2, 5)).toBeNull();
    expect(press(key("a"), "- one|")).toBeNull();
  });

  it("leaves a dash with no space after it alone", () => {
    expect(press(key("Enter"), "-word|")).toBeNull();
    expect(press(key("Enter"), "-|")).toBeNull();
  });
});

describe("Tab", () => {
  it("moves an empty item in under the one above it", () => {
    expect(press(key("Tab"), "- a\n- |")).toBe("- a\n  - |");
    expect(press(key("Tab"), "- a\n  - b\n  - |")).toBe("- a\n  - b\n    - |");
  });

  it("goes no further than one level under the item above", () => {
    expect(press(key("Tab"), "- a\n    - |")).toBeNull();
    expect(press(key("Tab"), "- |")).toBeNull();
    expect(press(key("Tab"), "plain\n- |")).toBeNull();
  });

  it("leaves Tab to the field anywhere else, so it can leave", () => {
    expect(press(key("Tab"), "- a\n- b|")).toBeNull();
    expect(press(key("Tab"), "plain|")).toBeNull();
    expect(press(key("Tab"), "|")).toBeNull();
  });

  it("moves an empty item out with Shift", () => {
    expect(press(key("Tab", { shiftKey: true }), "- a\n  - |")).toBe("- a\n- |");
    expect(press(key("Tab", { shiftKey: true }), "- a\n    - |")).toBe("- a\n  - |");
    expect(press(key("Tab", { shiftKey: true }), "- a\n- |")).toBeNull();
  });
});
