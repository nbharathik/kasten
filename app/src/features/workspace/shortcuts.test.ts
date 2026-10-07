import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useShell } from "../../lib/store";
import { actionFor, runFor, useGlobalShortcuts } from "./shortcuts";
import { useWorkspace } from "./store";

const press = (key: string, mods: KeyboardEventInit = {}) => new KeyboardEvent("keydown", { key, ...mods });

afterEach(() => {
  document.body.innerHTML = "";
  useShell.setState({ paletteOpen: false, shortcutsOpen: false });
  useWorkspace.setState({ ready: true });
});

describe("Window keys", () => {
  it("leave the page behind an open dialog alone", () => {
    document.body.innerHTML = '<div role="dialog" aria-modal="true" aria-label="Templates"></div>';
    expect(actionFor(press("n", { ctrlKey: true }))).toBeNull();
    expect(actionFor(press("w", { ctrlKey: true }))).toBeNull();
    expect(actionFor(press("k", { ctrlKey: true }))).toBeNull();
  });

  it("still close the palette and the shortcut sheet with the key that opened them", () => {
    document.body.innerHTML = '<div role="dialog" aria-modal="true" aria-label="Search and commands"></div>';
    useShell.setState({ paletteOpen: true });
    expect(actionFor(press("k", { ctrlKey: true }))).toBe(runFor("palette"));
    useShell.setState({ paletteOpen: false, shortcutsOpen: true });
    expect(actionFor(press("?", { ctrlKey: true, shiftKey: true }))).toBe(runFor("shortcuts"));
    expect(actionFor(press("k", { ctrlKey: true }))).toBeNull();
  });

  it("work as usual with no dialog open", () => {
    expect(actionFor(press("n", { ctrlKey: true }))).toBe(runFor("new-card"));
  });

  it("hold a key pressed while the vault opens, and run it once it is open", () => {
    useWorkspace.setState({ ready: false });
    const hook = renderHook(() => useGlobalShortcuts());
    const open = useShell.getState().sidebarOpen;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "\\", ctrlKey: true, cancelable: true }));
    expect(useShell.getState().sidebarOpen).toBe(open);
    useWorkspace.setState({ ready: true });
    expect(useShell.getState().sidebarOpen).toBe(!open);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "\\", ctrlKey: true, cancelable: true }));
    expect(useShell.getState().sidebarOpen).toBe(open);
    hook.unmount();
  });
});
