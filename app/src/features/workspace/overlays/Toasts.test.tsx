import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useWorkspace } from "../store";
import { TOAST_MS, Toasts } from "./Toasts";

const texts = () => useWorkspace.getState().toasts.map((t) => t.text);

beforeEach(() => {
  vi.useFakeTimers();
  useWorkspace.setState({ toasts: [] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Toasts", () => {
  it("lets a toast go after a while, but not while the pointer is on it", () => {
    render(<Toasts />);
    act(() => useWorkspace.getState().toast("Saved a copy"));
    const card = screen.getByText("Saved a copy").closest(".kasten-toast")!;
    fireEvent.pointerEnter(card);
    act(() => vi.advanceTimersByTime(TOAST_MS.plain * 3));
    expect(texts()).toEqual(["Saved a copy"]);
    fireEvent.pointerLeave(card);
    act(() => vi.advanceTimersByTime(TOAST_MS.plain));
    expect(card.classList.contains("is-leaving")).toBe(true);
    act(() => vi.advanceTimersByTime(TOAST_MS.leave));
    expect(texts()).toEqual([]);
  });

  it("stays longer when it offers an action, and runs it once", () => {
    const run = vi.fn();
    render(<Toasts />);
    act(() => useWorkspace.getState().toast("Moved “Plan” to the trash", { label: "Undo", run }));
    act(() => vi.advanceTimersByTime(TOAST_MS.plain + TOAST_MS.leave));
    expect(texts()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(run).toHaveBeenCalledOnce();
    expect(texts()).toEqual([]);
  });

  it("closes with its button, and the store keeps at most three", () => {
    render(<Toasts />);
    act(() => {
      for (const n of [1, 2, 3, 4]) useWorkspace.getState().toast(`Note ${n}`);
    });
    expect(texts()).toEqual(["Note 2", "Note 3", "Note 4"]);
    fireEvent.click(screen.getAllByRole("button", { name: "Dismiss" })[0]!);
    act(() => vi.advanceTimersByTime(TOAST_MS.leave));
    expect(texts()).toEqual(["Note 3", "Note 4"]);
  });
});
