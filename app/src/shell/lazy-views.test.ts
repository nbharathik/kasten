import { describe, expect, it } from "vitest";

import { preloadViews } from "./lazy-views";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("preloading views", () => {
  it("loads one view per idle spell, and goes on after one fails", async () => {
    const loaded: string[] = [];
    const idle: (() => void)[] = [];
    const view = (name: string, fails = false) => () => {
      loaded.push(name);
      return fails ? Promise.reject(new Error("offline")) : Promise.resolve();
    };
    preloadViews([view("library"), view("calendar", true), view("tasks")], (run) => idle.push(run));
    expect(loaded).toEqual([]);
    idle.shift()!();
    expect(loaded).toEqual(["library"]);
    // The next waits for the next idle spell.
    await settle();
    expect(idle).toHaveLength(1);
    idle.shift()!();
    await settle();
    idle.shift()!();
    expect(loaded).toEqual(["library", "calendar", "tasks"]);
    await settle();
    expect(idle).toHaveLength(1);
    idle.shift()!();
    expect(loaded).toHaveLength(3);
  });
});
