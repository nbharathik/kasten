import { afterEach, describe, expect, it, vi } from "vitest";

import { Popover, type MenuSection } from "./popover";

const anchor = () => ({ left: 10, top: 10, right: 20, bottom: 20 });
const rows = () => [...document.querySelectorAll<HTMLElement>(".kasten-menu-item")].map((r) => r.dataset.key);
const selected = () => document.querySelector<HTMLElement>(".kasten-menu-item.is-selected")?.dataset.key;
const key = (k: string, init: KeyboardEventInit = {}) =>
  window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));

let open: Popover | null = null;
afterEach(() => open?.close());

function menu(picked: string[]): MenuSection[] {
  const item = (k: string) => ({ key: k, label: k, onPick: () => void picked.push(k) });
  return [
    { title: "One", items: [item("a"), item("b")] },
    { items: [{ key: "more", label: "More", submenu: () => [{ items: [item("deep")] }] }, { ...item("del"), keys: ["Delete"] }] },
  ];
}

describe("popover menus", () => {
  it("move with the arrow keys, wrapping around, and pick with Enter", () => {
    const picked: string[] = [];
    open = new Popover(menu(picked), { anchor, ownKeys: true });
    expect(rows()).toEqual(["a", "b", "more", "del"]);
    expect(selected()).toBe("a");
    key("ArrowUp");
    expect(selected()).toBe("del");
    key("ArrowDown");
    key("ArrowDown");
    key("Enter");
    expect(picked).toEqual(["b"]);
    expect(open.isOpen).toBe(false);
  });

  it("open submenus to the side and pick inside them", () => {
    const picked: string[] = [];
    open = new Popover(menu(picked), { anchor, ownKeys: true });
    key("ArrowDown");
    key("ArrowDown");
    key("ArrowRight");
    expect(rows()).toContain("deep");
    key("ArrowLeft");
    expect(rows()).not.toContain("deep");
    key("Enter");
    key("Enter");
    expect(picked).toEqual(["deep"]);
  });

  it("pick items by their own keys and keep typing away from the page", () => {
    const picked: string[] = [];
    const typed = vi.fn();
    document.addEventListener("keydown", typed);
    open = new Popover(menu(picked), { anchor, ownKeys: true });
    key("x");
    key("Delete");
    document.removeEventListener("keydown", typed);
    expect(typed).not.toHaveBeenCalled();
    expect(picked).toEqual(["del"]);
  });

  it("close on Escape and on a click outside", () => {
    const onClose = vi.fn();
    open = new Popover(menu([]), { anchor, ownKeys: true, onClose });
    key("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);

    open = new Popover(menu([]), { anchor, onClose });
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(open.isOpen).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("say so when there is nothing to pick", () => {
    open = new Popover([{ items: [] }], { anchor, emptyText: "No results" });
    expect(document.querySelector(".kasten-menu")?.textContent).toBe("No results");
  });
});
