import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const warmUp = vi.hoisted(() => vi.fn());
vi.mock("@kasten-slides/wasm", () => ({ warmUp }));

type Idle = { requestIdleCallback?: unknown; cancelIdleCallback?: unknown };
const idle = globalThis as unknown as Idle;

/** The module afresh: whether the page has been warmed is kept in it. */
async function fresh() {
  vi.resetModules();
  return import("./warm-up.ts");
}

beforeEach(() => {
  warmUp.mockReset();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  delete idle.requestIdleCallback;
  delete idle.cancelIdleCallback;
});

describe("getting the engine ready", () => {
  it("waits for an idle moment, with a limit to the wait, and does the work then", async () => {
    const callbacks: (() => void)[] = [];
    const request = vi.fn((run: () => void) => callbacks.push(run));
    idle.requestIdleCallback = request;
    const { warmUpWhenIdle } = await fresh();
    warmUpWhenIdle();
    expect(warmUp).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith(expect.any(Function), { timeout: 3000 });
    callbacks[0]?.();
    expect(warmUp).toHaveBeenCalledTimes(1);
  });

  it("is done once for the page, however often it is asked", async () => {
    const callbacks: (() => void)[] = [];
    idle.requestIdleCallback = (run: () => void) => callbacks.push(run);
    const { warmUpWhenIdle } = await fresh();
    warmUpWhenIdle();
    warmUpWhenIdle();
    for (const run of callbacks) run();
    warmUpWhenIdle();
    expect(callbacks).toHaveLength(2);
    expect(warmUp).toHaveBeenCalledTimes(1);
  });

  it("can be taken back before it is done", async () => {
    const cancel = vi.fn();
    idle.requestIdleCallback = () => 7;
    idle.cancelIdleCallback = cancel;
    const { warmUpWhenIdle } = await fresh();
    warmUpWhenIdle()();
    expect(cancel).toHaveBeenCalledWith(7);
  });

  it("uses a timer where the browser has no idle callback", async () => {
    const { warmUpWhenIdle } = await fresh();
    warmUpWhenIdle();
    expect(warmUp).not.toHaveBeenCalled();
    vi.advanceTimersByTime(700);
    expect(warmUp).toHaveBeenCalledTimes(1);
    const { warmUpWhenIdle: again } = await fresh();
    again();
    vi.advanceTimersByTime(700);
    expect(warmUp).toHaveBeenCalledTimes(2);
  });

  it("never lets an engine that is not there get in anyone's way", async () => {
    warmUp.mockImplementation(() => {
      throw new Error("the module is not loaded");
    });
    const { warmUpWhenIdle } = await fresh();
    warmUpWhenIdle();
    expect(() => vi.advanceTimersByTime(700)).not.toThrow();
  });

  it("starts with the editor: not before it is there, and not again when it stays", async () => {
    const { useWarmUp } = await fresh();
    const view = renderHook(({ ready }) => useWarmUp(ready), { initialProps: { ready: false } });
    vi.advanceTimersByTime(700);
    expect(warmUp).not.toHaveBeenCalled();
    view.rerender({ ready: true });
    vi.advanceTimersByTime(700);
    expect(warmUp).toHaveBeenCalledTimes(1);
    view.rerender({ ready: true });
    vi.advanceTimersByTime(700);
    expect(warmUp).toHaveBeenCalledTimes(1);
  });

  it("is taken back when the editor goes before the idle moment", async () => {
    const { useWarmUp } = await fresh();
    const view = renderHook(() => useWarmUp(true));
    view.unmount();
    vi.advanceTimersByTime(700);
    expect(warmUp).not.toHaveBeenCalled();
  });
});
