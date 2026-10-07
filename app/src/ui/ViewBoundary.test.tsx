import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { componentsOf, ViewBoundary } from "./ViewBoundary";

let broken = true;
function Fragile({ name }: { name: string }) {
  if (broken) throw new Error("The board's file is not JSON");
  return <p>{name}</p>;
}

afterEach(() => {
  cleanup();
  broken = true;
});

describe("a view's boundary", () => {
  it("shows a failure, tries again, and starts afresh elsewhere", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const view = render(
      <ViewBoundary place="boards:a.canvas">
        <Fragile name="A" />
      </ViewBoundary>,
    );
    expect(screen.getByRole("alert").textContent).toContain("The board's file is not JSON");
    broken = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("A")).toBeTruthy();
    broken = true;
    view.rerender(
      <ViewBoundary place="boards:b.canvas">
        <Fragile name="B" />
      </ViewBoundary>,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    broken = false;
    view.rerender(
      <ViewBoundary place="boards:c.canvas">
        <Fragile name="C" />
      </ViewBoundary>,
    );
    expect(screen.getByText("C")).toBeTruthy();
    vi.restoreAllMocks();
  });

  it("keeps what it shows when only the place changes", () => {
    broken = false;
    const view = render(
      <ViewBoundary place="page:a.md">
        <input aria-label="Kept" defaultValue="typed" />
      </ViewBoundary>,
    );
    const input = screen.getByRole("textbox", { name: "Kept" });
    view.rerender(
      <ViewBoundary place="page:b.md">
        <input aria-label="Kept" defaultValue="typed" />
      </ViewBoundary>,
    );
    expect(screen.getByRole("textbox", { name: "Kept" })).toBe(input);
  });

  it("names the components it happened in and copies the details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(
      <ViewBoundary place="page:notes.md">
        <Fragile name="A" />
      </ViewBoundary>,
    );
    fireEvent.click(screen.getByText("Details"));
    expect(screen.getByText(/^In Fragile/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy details" }));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
    const report = (writeText.mock.calls[0] as unknown as [string])[0];
    expect(report).toContain("the view at “page:notes.md” failed");
    expect(report).toContain("The board's file is not JSON");
    expect(report).toContain("Fragile");
    vi.restoreAllMocks();
  });

  it("reads component names from a component stack", () => {
    const stack = "\n    at HistoryTab (http://localhost/HistoryTab.tsx:12:3)\n    at div\n    at RightPanel (x)\n    at RightPanel (x)\n    at NotePage (y)";
    expect(componentsOf(stack)).toEqual(["HistoryTab", "RightPanel", "NotePage"]);
    expect(componentsOf(null)).toEqual([]);
  });

  it("offers a way out when one is given", () => {
    broken = true;
    const run = vi.fn();
    render(
      <ViewBoundary place="app" reset={{ label: "Reset the layout", run }}>
        <Fragile name="Shell" />
      </ViewBoundary>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reset the layout" }));
    expect(run).toHaveBeenCalledOnce();
  });
});
