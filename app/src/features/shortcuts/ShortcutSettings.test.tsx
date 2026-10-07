import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { COMMANDS } from "../workspace/overlays/commands";
import { actionFor, runFor } from "../workspace/shortcuts";
import { KEY_SECTIONS } from "./catalog";
import { ShortcutSettings } from "./ShortcutSettings";
import { useKeys } from "./store";

const press = (key: string, mods: KeyboardEventInit = {}) => new KeyboardEvent("keydown", { key, ...mods });
const changeKey = (label: string) => screen.getByRole("button", { name: `Change the key for ${label}` });

beforeEach(() => {
  localStorage.clear();
  useKeys.getState().resetAll();
});
afterEach(cleanup);

describe("Keyboard shortcuts in Settings", () => {
  it("lists every palette command once", () => {
    const listed = KEY_SECTIONS.flatMap((s) => s.ids);
    expect(new Set(listed).size).toBe(listed.length);
    for (const command of COMMANDS) expect(listed).toContain(command.id);
  });

  it("keeps the keys the window had", () => {
    expect(actionFor(press("k", { ctrlKey: true }))).toBe(runFor("palette"));
    expect(actionFor(press("p", { ctrlKey: true }))).toBe(runFor("palette"));
    expect(actionFor(press("?", { ctrlKey: true, shiftKey: true }))).toBe(runFor("shortcuts"));
    expect(actionFor(press("Tab", { ctrlKey: true }))).toBe(runFor("next-tab"));
    expect(actionFor(press("Tab", { ctrlKey: true, shiftKey: true }))).toBe(runFor("prev-tab"));
    expect(actionFor(press("ArrowLeft", { altKey: true }))).toBe(runFor("back"));
    expect(actionFor(press("ArrowRight", { ctrlKey: true, altKey: true }))).toBe(runFor("split"));
    expect(actionFor(press("|", { ctrlKey: true, shiftKey: true }))).toBe(runFor("focus"));
    expect(actionFor(press("x", { ctrlKey: true }))).toBeNull();
    expect(actionFor(press("j"))).toBeNull();
  });

  it("records a new key for a command, and the old one stops working", () => {
    render(<ShortcutSettings />);
    const change = changeKey("Journal");
    expect(change.textContent).toBe("Ctrl+J");
    fireEvent.click(change);
    expect(change.textContent).toBe("Press keys…");
    // A modifier on its own waits for the key.
    fireEvent.keyDown(change, { key: "Control", ctrlKey: true });
    expect(change.textContent).toBe("Press keys…");
    fireEvent.keyDown(change, { key: "Y", ctrlKey: true, shiftKey: true });
    expect(change.textContent).toBe("Ctrl+Shift+Y");
    expect(actionFor(press("j", { ctrlKey: true }))).toBeNull();
    expect(actionFor(press("Y", { ctrlKey: true, shiftKey: true }))).toBe(runFor("journal"));
    expect(JSON.parse(localStorage.getItem("kasten.keys")!)).toEqual({ journal: ["Mod+Shift+Y"] });
  });

  it("moves a key another command had, and says which", () => {
    render(<ShortcutSettings />);
    const change = changeKey("Go to Calendar");
    expect(change.textContent).toBe("Add key");
    fireEvent.click(change);
    fireEvent.keyDown(change, { key: "j", ctrlKey: true });
    expect(change.textContent).toBe("Ctrl+J");
    expect(screen.getByRole("status").textContent).toBe("Taken from Journal");
    expect(changeKey("Journal").textContent).toBe("Add key");
    expect(actionFor(press("j", { ctrlKey: true }))).toBe(runFor("calendar"));
  });

  it("refuses a key typing would press, and removes and resets keys", () => {
    render(<ShortcutSettings />);
    const change = changeKey("Journal");
    fireEvent.click(change);
    fireEvent.keyDown(change, { key: "j" });
    expect(screen.getByRole("status").textContent).toMatch(/J would run while typing/);
    fireEvent.keyDown(change, { key: "Backspace" });
    expect(change.textContent).toBe("Add key");
    fireEvent.click(screen.getByRole("button", { name: "Reset Journal" }));
    expect(change.textContent).toBe("Ctrl+J");
    fireEvent.click(screen.getByRole("button", { name: "Remove the key for Journal" }));
    expect(change.textContent).toBe("Add key");
    fireEvent.click(screen.getByRole("button", { name: "Reset all (1)" }));
    expect(change.textContent).toBe("Ctrl+J");
    expect(screen.queryByRole("button", { name: /Reset all/ })).toBeNull();
  });

  it("cancels with Escape, and finds commands by name or key", () => {
    render(<ShortcutSettings />);
    const change = changeKey("Journal");
    fireEvent.click(change);
    fireEvent.keyDown(change, { key: "Escape" });
    expect(change.textContent).toBe("Ctrl+J");
    const find = screen.getByRole("searchbox", { name: "Find a command" });
    fireEvent.change(find, { target: { value: "ctrl+shift+n" } });
    expect(screen.getAllByRole("button", { name: /^Change the key for/ }).map((b) => b.getAttribute("aria-label"))).toEqual(["Change the key for New page"]);
    fireEvent.change(find, { target: { value: "whiteboard" } });
    expect(screen.getAllByRole("button", { name: /^Change the key for/ }).map((b) => b.getAttribute("aria-label"))).toEqual(["Change the key for Go to Whiteboards", "Change the key for New whiteboard"]);
  });
});
