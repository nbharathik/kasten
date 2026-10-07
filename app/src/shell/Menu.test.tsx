import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Menu, openRowMenu } from "./Menu";

const box = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

/** Lays out the menu's button at `button` and the open menu at 224 × 300 (jsdom has no layout). */
function layout(button: DOMRect) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.getAttribute("role") === "menu") return box(0, 0, 224, 300);
    if (this.getAttribute("aria-label") === "More") return button;
    return box(0, 0, 0, 0);
  });
}

function open() {
  render(
    <Menu label="More" float align="left" items={[{ label: "One", onSelect: () => {} }]}>
      •••
    </Menu>,
  );
  fireEvent.click(screen.getByRole("button", { name: "More" }));
  return screen.getByRole("menu", { name: "More" }).parentElement!;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("a floating menu", () => {
  it("opens below its button, from the button's left edge", () => {
    layout(box(180, 100, 20, 20));
    const menu = open();
    expect(menu.className).toContain("fixed");
    expect([menu.style.left, menu.style.top]).toEqual(["180px", "124px"]);
    expect(screen.getByRole("menuitem", { name: "One" })).toBeTruthy();
  });

  it("opens upwards near the window's bottom and stays inside its right edge", () => {
    // jsdom's window is 1024 × 768.
    layout(box(900, 700, 20, 20));
    const menu = open();
    expect([menu.style.left, menu.style.top]).toEqual([`${1024 - 8 - 224}px`, `${700 - 4 - 300}px`]);
  });
});

describe("a menu from the keyboard", () => {
  const items = (picked: string[]) =>
    ["Rename", "Duplicate", "Delete"].map((label) => ({ label, onSelect: () => picked.push(label) }));

  it("opens on Enter or ArrowDown with its first item focused, and the arrows go round", async () => {
    const picked: string[] = [];
    render(<Menu label="Actions" items={items(picked)}>…</Menu>);
    const button = screen.getByRole("button", { name: "Actions" });
    expect(button.getAttribute("aria-haspopup")).toBe("menu");
    button.focus();
    await act(async () => fireEvent.keyDown(button, { key: "ArrowDown" }));
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Rename" }));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Delete" }));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Rename" }));
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    await act(async () => fireEvent.click(document.activeElement!));
    expect(picked).toEqual(["Delete"]);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("gives focus back to its button on Escape", async () => {
    render(<Menu label="Actions" items={items([])}>…</Menu>);
    const button = screen.getByRole("button", { name: "Actions" });
    // A click from the keyboard carries no pointer detail.
    await act(async () => fireEvent.click(button, { detail: 0 }));
    expect(document.activeElement?.getAttribute("role")).toBe("menuitem");
    await act(async () => fireEvent.keyDown(document.activeElement!, { key: "Escape" }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("opened by the pointer, takes the focus itself, so the arrows work", async () => {
    render(<Menu label="Actions" items={items([])}>…</Menu>);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Actions" }), { detail: 1 }));
    const menu = screen.getByRole("menu", { name: "Actions" });
    expect(document.activeElement).toBe(menu);
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Rename" }));
  });

  it("opens a row's own menu on right-click, in place of the browser's", () => {
    const picked = vi.fn();
    render(
      <div data-testid="row" onContextMenu={openRowMenu}>
        <span>A page</span>
        <Menu label="More for A page" items={[{ label: "Rename", onSelect: picked }]}>
          …
        </Menu>
      </div>,
    );
    const shown = fireEvent.contextMenu(screen.getByText("A page"));
    expect(shown).toBe(false);
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    expect(picked).toHaveBeenCalled();

    // A row without a menu keeps the browser's.
    render(<div data-testid="plain" onContextMenu={openRowMenu}>Plain</div>);
    expect(fireEvent.contextMenu(screen.getByText("Plain"))).toBe(true);
  });
});

