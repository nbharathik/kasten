// A control's title shows as the app's tooltip after a moment, its
// shortcut as a keycap, and goes back on the control when the pointer
// leaves. The editor's text is left alone.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { splitTip, TIP_DELAY_MS, Tooltips } from "./Tooltips";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("tooltips", () => {
  it("split a shortcut in brackets from the words", () => {
    expect(splitTip("Zoom in (+)")).toEqual({ text: "Zoom in", keys: "+" });
    expect(splitTip("Back to 100% (Shift+0)")).toEqual({ text: "Back to 100%", keys: "Shift+0" });
    expect(splitTip("Fit everything in view (F)")).toEqual({ text: "Fit everything in view", keys: "F" });
    expect(splitTip("Move to trash (3 cards)")).toEqual({ text: "Move to trash (3 cards)" });
    expect(splitTip("Settings")).toEqual({ text: "Settings" });
  });

  it("show a title after a moment, and give it back when the pointer leaves", () => {
    render(
      <>
        <Tooltips />
        <button type="button" title="Zoom in (+)">
          +
        </button>
        <p>Elsewhere</p>
      </>,
    );
    const button = screen.getByRole("button", { name: "+" });
    fireEvent.pointerOver(button);
    act(() => void vi.advanceTimersByTime(TIP_DELAY_MS - 50));
    expect(screen.queryByRole("tooltip")).toBeNull();
    act(() => void vi.advanceTimersByTime(50));
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toBe("Zoom in+");
    expect(tip.querySelector("kbd")?.textContent).toBe("+");
    expect(button.hasAttribute("title")).toBe(false);

    act(() => void fireEvent.pointerOut(button, { relatedTarget: screen.getByText("Elsewhere") }));
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(button.getAttribute("title")).toBe("Zoom in (+)");
  });

  it("leave the editor's text alone", () => {
    render(
      <>
        <Tooltips />
        <div className="ProseMirror" contentEditable suppressContentEditableWarning>
          <a href="https://example.com" title="https://example.com">
            a link
          </a>
        </div>
      </>,
    );
    fireEvent.pointerOver(screen.getByText("a link"));
    act(() => void vi.advanceTimersByTime(TIP_DELAY_MS * 2));
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(screen.getByText("a link").getAttribute("title")).toBe("https://example.com");
  });
});
