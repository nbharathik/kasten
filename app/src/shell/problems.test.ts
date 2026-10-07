import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useWorkspace } from "../features/workspace/store";
import { describeProblem, QUIET_MS, watchProblems } from "./problems";

const toasts = () => useWorkspace.getState().toasts.map((t) => t.text);
let stop: () => void = () => {};
let clock = 0;

beforeEach(() => {
  useWorkspace.setState({ toasts: [] });
  vi.spyOn(console, "error").mockImplementation(() => {});
  clock = 1_000;
  stop = watchProblems(window, () => clock);
});
afterEach(() => {
  stop();
  vi.restoreAllMocks();
});

function reject(reason: unknown) {
  const event = new Event("unhandledrejection") as PromiseRejectionEvent;
  Object.defineProperty(event, "reason", { value: reason });
  window.dispatchEvent(event);
}

describe("problems nothing else caught", () => {
  it("says a failed promise once in a toast, and again only after a while", () => {
    reject(new Error("The vault is not open"));
    reject(new Error("The vault is not open"));
    expect(toasts()).toEqual(["Something went wrong: The vault is not open"]);
    clock += QUIET_MS + 1;
    reject(new Error("The vault is not open"));
    expect(toasts()).toHaveLength(2);
    expect(console.error).toHaveBeenCalledTimes(3);
  });

  it("says an error thrown in a handler, but not the browser's harmless notices", () => {
    window.dispatchEvent(new ErrorEvent("error", { error: new TypeError("x is undefined"), message: "x is undefined" }));
    window.dispatchEvent(new ErrorEvent("error", { message: "ResizeObserver loop completed with undelivered notifications." }));
    expect(toasts()).toEqual(["Something went wrong: x is undefined"]);
  });

  it("describes anything a promise can fail with", () => {
    expect(describeProblem("No such note")).toBe("No such note");
    expect(describeProblem({ code: 7 })).toBe('{"code":7}');
    expect(describeProblem(undefined)).toBe("undefined");
  });

  it("stops listening when asked", () => {
    stop();
    reject(new Error("Later"));
    expect(toasts()).toEqual([]);
  });
});
