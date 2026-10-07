import { describe, expect, it } from "vitest";

import { shortcutFrom } from "./desktop";

const key = (code: string, mods: Partial<Record<"ctrlKey" | "metaKey" | "altKey" | "shiftKey", boolean>> = {}) => ({ code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });

describe("recording the quick capture shortcut", () => {
  it("writes Cmd on a Mac and Ctrl elsewhere as CmdOrCtrl", () => {
    expect(shortcutFrom(key("Space", { metaKey: true, shiftKey: true }), true)).toBe("CmdOrCtrl+Shift+Space");
    expect(shortcutFrom(key("Space", { ctrlKey: true, shiftKey: true }), false)).toBe("CmdOrCtrl+Shift+Space");
    expect(shortcutFrom(key("KeyN", { altKey: true }), false)).toBe("Alt+KeyN");
    expect(shortcutFrom(key("KeyJ", { ctrlKey: true, altKey: true }), true)).toBe("Ctrl+Alt+KeyJ");
  });

  it("waits while only modifiers are down, and refuses Shift alone", () => {
    expect(shortcutFrom(key("ShiftLeft", { shiftKey: true }), false)).toBeNull();
    expect(shortcutFrom(key("MetaLeft", { metaKey: true }), true)).toBeNull();
    expect(shortcutFrom(key("KeyA", { shiftKey: true }), false)).toBeNull();
    expect(shortcutFrom(key("KeyA"), false)).toBeNull();
  });
});
