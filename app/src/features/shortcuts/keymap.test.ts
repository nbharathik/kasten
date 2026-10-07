import { describe, expect, it } from "vitest";

import { DEFAULT_KEYS, assign, bindingOf, canBind, formatBinding, lookupFor, resolveKeymap } from "./keymap";

const press = (key: string, mods: Partial<Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "altKey" | "shiftKey">> = {}, code = "") =>
  ({ key, code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods }) as KeyboardEvent;

describe("bindingOf", () => {
  it("reads Ctrl as the main modifier off macOS and Cmd on it", () => {
    expect(bindingOf(press("k", { ctrlKey: true }), false)).toBe("Mod+K");
    expect(bindingOf(press("k", { metaKey: true }), true)).toBe("Mod+K");
    expect(bindingOf(press("k", { ctrlKey: true }), true)).toBe("Ctrl+K");
  });

  it("names shifted symbols by their unshifted key", () => {
    expect(bindingOf(press("?", { ctrlKey: true, shiftKey: true }), false)).toBe("Mod+Shift+/");
    expect(bindingOf(press("|", { ctrlKey: true, shiftKey: true }), false)).toBe("Mod+Shift+\\");
    expect(bindingOf(press(">", { ctrlKey: true, shiftKey: true }), false)).toBe("Mod+Shift+.");
    expect(bindingOf(press("H", { ctrlKey: true, shiftKey: true }), false)).toBe("Mod+Shift+H");
  });

  it("reads the key under Option on macOS, not the character it types", () => {
    expect(bindingOf(press("˚", { altKey: true }, "KeyK"), true)).toBe("Alt+K");
    expect(bindingOf(press("¡", { altKey: true, metaKey: true }, "Digit1"), true)).toBe("Mod+Alt+1");
  });

  it("orders modifiers the same way whatever was pressed first", () => {
    expect(bindingOf(press("ArrowRight", { altKey: true, ctrlKey: true }), false)).toBe("Mod+Alt+ArrowRight");
    expect(bindingOf(press(" ", { ctrlKey: true }), false)).toBe("Mod+Space");
  });

  it("gives nothing for a modifier on its own or a key it cannot name", () => {
    expect(bindingOf(press("Control", { ctrlKey: true }), false)).toBeNull();
    expect(bindingOf(press("Dead", { altKey: true }), false)).toBeNull();
    expect(bindingOf(press("Unidentified", { ctrlKey: true }), false)).toBeNull();
  });
});

describe("formatBinding", () => {
  it("writes keys as each system does", () => {
    expect(formatBinding("Mod+Shift+N", false)).toBe("Ctrl+Shift+N");
    expect(formatBinding("Mod+Shift+N", true)).toBe("⇧⌘N");
    expect(formatBinding("Mod+Alt+ArrowRight", false)).toBe("Ctrl+Alt+→");
    expect(formatBinding("Mod+Alt+ArrowRight", true)).toBe("⌥⌘→");
    expect(formatBinding("Ctrl+Tab", true)).toBe("⌃Tab");
    expect(formatBinding("Mod+Space", false)).toBe("Ctrl+Space");
  });
});

describe("canBind", () => {
  it("wants Ctrl, Cmd or Alt, so typing never runs a command", () => {
    expect(canBind("Mod+J")).toBe(true);
    expect(canBind("Alt+ArrowLeft")).toBe(true);
    expect(canBind("F6")).toBe(true);
    expect(canBind("J")).toBe(false);
    expect(canBind("Shift+J")).toBe(false);
    expect(canBind("Enter")).toBe(false);
  });
});

describe("resolveKeymap", () => {
  it("starts from the defaults", () => {
    const keymap = resolveKeymap({}, false);
    expect(keymap.palette).toEqual(["Mod+K", "Mod+P"]);
    expect(keymap["new-page"]).toEqual(["Mod+Shift+N"]);
  });

  it("reads Ctrl as the main modifier off macOS, so Ctrl+Tab is one key", () => {
    expect(resolveKeymap({}, false)["next-tab"]).toEqual(["Mod+Tab", "Mod+PageDown"]);
    expect(resolveKeymap({}, true)["next-tab"]).toEqual(["Ctrl+Tab", "Mod+PageDown"]);
  });

  it("lets a person's keys replace a command's, or clear them", () => {
    const keymap = resolveKeymap({ journal: ["Mod+Shift+J"], "new-card": [] }, false);
    expect(keymap.journal).toEqual(["Mod+Shift+J"]);
    expect(keymap["new-card"]).toEqual([]);
    expect(keymap.calendar ?? []).toEqual([]);
  });

  it("ignores stored keys that are not keys", () => {
    const keymap = resolveKeymap({ journal: ["J", 42 as unknown as string, "Mod+Shift+J"] }, false);
    expect(keymap.journal).toEqual(["Mod+Shift+J"]);
  });
});

describe("assign", () => {
  it("gives a command a key, taking it from whichever command had it", () => {
    const { overrides, took } = assign({}, "calendar", "Mod+J", false);
    expect(overrides.calendar).toEqual(["Mod+J"]);
    expect(overrides.journal).toEqual([]);
    expect(took).toEqual(["journal"]);
    const keymap = resolveKeymap(overrides, false);
    expect(lookupFor(keymap).get("Mod+J")).toBe("calendar");
  });

  it("clears a command's keys with null and resets them with undefined", () => {
    const cleared = assign({ journal: ["Mod+Shift+J"] }, "journal", null, false).overrides;
    expect(cleared.journal).toEqual([]);
    const reset = assign(cleared, "journal", undefined, false).overrides;
    expect("journal" in reset).toBe(false);
    expect(resolveKeymap(reset, false).journal).toEqual(DEFAULT_KEYS.journal);
  });

  it("takes a default key back from the command that took it when reset", () => {
    const moved = assign({}, "calendar", "Mod+J", false).overrides;
    const { overrides, took } = assign(moved, "journal", undefined, false);
    expect(took).toEqual(["calendar"]);
    expect(resolveKeymap(overrides, false).calendar).toEqual([]);
    expect(lookupFor(resolveKeymap(overrides, false)).get("Mod+J")).toBe("journal");
  });
});
