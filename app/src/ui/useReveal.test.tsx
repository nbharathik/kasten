import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useReveal } from "./useReveal";

type Seen = (entries: { isIntersecting: boolean }[]) => void;
let seen: Seen[] = [];

class FakeObserver {
  constructor(callback: Seen) {
    seen.push(callback);
  }
  observe() {}
  disconnect() {}
}

function List({ total }: { total: number }) {
  const { shown, more } = useReveal(total, 10);
  return (
    <ul>
      {Array.from({ length: shown }, (_, i) => (
        <li key={i}>row {i}</li>
      ))}
      {shown < total && <div ref={more} data-testid="more" />}
    </ul>
  );
}

afterEach(() => {
  cleanup();
  seen = [];
  vi.unstubAllGlobals();
});

describe("a long list drawn in steps", () => {
  it("draws the first step, then more each time the end comes near", () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    const view = render(<List total={25} />);
    expect(view.getAllByRole("listitem")).toHaveLength(10);
    act(() => seen.at(-1)!([{ isIntersecting: true }]));
    expect(view.getAllByRole("listitem")).toHaveLength(20);
    act(() => seen.at(-1)!([{ isIntersecting: false }]));
    expect(view.getAllByRole("listitem")).toHaveLength(20);
    act(() => seen.at(-1)!([{ isIntersecting: true }]));
    expect(view.getAllByRole("listitem")).toHaveLength(25);
    expect(view.queryByTestId("more")).toBeNull();
  });

  it("draws a short list whole, with nothing to watch", () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    const view = render(<List total={4} />);
    expect(view.getAllByRole("listitem")).toHaveLength(4);
    expect(seen).toHaveLength(0);
  });
});
