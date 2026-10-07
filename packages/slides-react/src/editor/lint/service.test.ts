import { setReferences } from "@kasten-slides/wasm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { type Kit, offEdge, openLinted, openWithoutSlides } from "./test-kit.ts";

let kit: Kit | null = null;
afterEach(() => {
  setReferences(null);
  kit?.service.dispose();
  void kit?.session.dispose();
  kit = null;
});

async function open(blank = 2): Promise<Kit> {
  kit = await openLinted(blank);
  return kit;
}

const put = (k: Kit, slide: string, id = "") => k.session.core.apply("add_elements", { slide, elements: [offEdge(id)] });
const rules = (k: Kit, slide: string) => k.service.issuesOf(slide).map((i) => i.rule);

describe("checking as the deck is edited", () => {
  it("checks every slide in idle time after the deck is opened, and finds nothing wrong with a finished deck", async () => {
    const k = await open();
    expect(k.service.stats.slidesChecked).toBe(0);
    expect(k.clock.runIdle()).toBe(1);
    expect(k.service.stats.slidesChecked).toBe(3);
    expect(k.service.getSnapshot().issues.size).toBe(0);
    expect(k.clock.idles).toHaveLength(0);
  });

  it("waits 400 ms of quiet after a change, then checks only the slides that changed", async () => {
    const k = await open();
    k.clock.runIdle();
    const before = k.service.stats.slidesChecked;
    put(k, k.slides[1]!, "wide");
    expect(k.clock.timers.map((t) => t.at)).toEqual([400]);
    k.clock.advance(399);
    expect(k.clock.idles).toHaveLength(0);
    k.clock.advance(1);
    expect(k.clock.idles).toHaveLength(1);
    k.clock.runIdle();
    expect(k.service.stats.slidesChecked - before).toBe(1);
    expect(rules(k, k.slides[1]!)).toEqual(["off-slide"]);
    expect(k.service.issuesOf(k.slides[2]!)).toEqual([]);
    expect(k.service.getSnapshot().issues.get(k.slides[1]!)?.[0]).toMatchObject({ severity: "error", element: "wide" });
  });

  it("starts the wait again with every change, so typing is never interrupted", async () => {
    const k = await open();
    k.clock.runIdle();
    for (let i = 0; i < 5; i++) {
      put(k, k.slides[1]!);
      k.clock.advance(300);
    }
    expect(k.clock.idles).toHaveLength(0);
    expect(k.clock.timers).toHaveLength(1);
    k.clock.advance(400);
    expect(k.clock.idles).toHaveLength(1);
  });

  it("checks the slide that is shown first", async () => {
    const k = await open(3);
    k.clock.runIdle();
    for (const slide of k.slides.slice(1)) put(k, slide);
    k.session.goTo(k.slides[3]!);
    k.clock.advance(400);
    // One slide of the work at a time: the shown slide is the first done.
    k.clock.runIdle(10, 20);
    expect(rules(k, k.slides[3]!)).toEqual(["off-slide"]);
    expect(k.service.issuesOf(k.slides[1]!)).toEqual([]);
    expect(k.clock.idles).toHaveLength(1);
    k.clock.settle();
    expect(k.service.getSnapshot().issues.size).toBe(3);
  });

  it("works in slices: when the idle time is used up it asks for more", async () => {
    const k = await open(4);
    k.clock.runIdle(10, 20);
    expect(k.service.stats.slidesChecked).toBe(1);
    expect(k.clock.idles).toHaveLength(1);
    k.clock.settle();
    expect(k.service.stats.slidesChecked).toBe(5);
  });

  it("takes back a problem when it is put right, and forgets a slide that is deleted", async () => {
    const k = await open();
    k.clock.settle();
    put(k, k.slides[1]!);
    put(k, k.slides[2]!);
    k.clock.settle();
    expect(k.service.getSnapshot().issues.size).toBe(2);
    k.session.undo();
    k.clock.settle();
    expect(rules(k, k.slides[2]!)).toEqual([]);
    k.session.core.apply("delete_slides", { ids: [k.slides[1]!] });
    expect(k.service.issuesOf(k.slides[1]!)).toEqual([]);
    expect(k.service.getSnapshot().issues.size).toBe(0);
  });

  it("keeps the same array for a slide whose problems did not change, and tells nobody", async () => {
    const k = await open();
    put(k, k.slides[1]!, "wide");
    k.clock.settle();
    const first = k.service.issuesOf(k.slides[1]!);
    const snapshot = k.service.getSnapshot();
    let told = 0;
    k.service.subscribe(() => (told += 1));
    // A change that leaves the problems as they are.
    k.session.core.apply("set_notes", { slide: k.slides[1]!, notes: "said aloud" });
    k.clock.settle();
    expect(k.service.issuesOf(k.slides[1]!)).toBe(first);
    expect(k.service.getSnapshot()).toBe(snapshot);
    expect(told).toBe(0);
  });

  it("checks everything again when asked, and says when it is done", async () => {
    const k = await open();
    k.clock.settle();
    const before = k.service.stats.slidesChecked;
    let told = 0;
    k.service.subscribe(() => (told += 1));
    const done = k.service.checkAll();
    expect(k.service.getSnapshot().checking).toBe(true);
    k.clock.runIdle();
    await done;
    expect(k.service.stats.slidesChecked - before).toBe(3);
    expect(k.service.getSnapshot()).toMatchObject({ checking: false, checks: 1 });
    expect(told).toBeGreaterThanOrEqual(2);
  });

  it("names the rules that could not be checked here", async () => {
    const k = await open();
    k.clock.settle();
    expect(k.service.getSnapshot().skipped.map((s) => s.rule)).toEqual(["unresolved-citation"]);
  });

  it("checks citation keys against the bibliography the page was given, and again when it changes", async () => {
    const k = await open();
    const slide = k.slides[1]!;
    k.session.core.apply("add_elements", {
      slide,
      elements: [{ type: "citation", id: "cite", x: 64, y: 470, w: 500, h: 30, keys: ["smith2020", "smyth2020"] }],
    });
    k.clock.settle();
    expect(rules(k, slide)).not.toContain("unresolved-citation");
    expect(k.service.getSnapshot().skipped.map((s) => s.rule)).toEqual(["unresolved-citation"]);

    setReferences("@article{smith2020, title={A}}");
    k.clock.settle();
    expect(k.service.issuesOf(slide).filter((i) => i.rule === "unresolved-citation").map((i) => [i.severity, i.element])).toEqual([["error", "cite"]]);
    expect(k.service.issuesOf(slide).find((i) => i.rule === "unresolved-citation")?.message).toContain("smith2020");
    expect(k.service.getSnapshot().skipped).toEqual([]);

    setReferences(null);
    k.clock.settle();
    expect(rules(k, slide)).not.toContain("unresolved-citation");
    expect(k.service.getSnapshot().skipped.map((s) => s.rule)).toEqual(["unresolved-citation"]);
  });

  it("marks every slide when the theme changes, and none when only one slide does", async () => {
    const k = await open();
    k.clock.settle();
    const before = k.service.stats.slidesChecked;
    k.session.core.apply("set_notes", { slide: k.slides[1]!, notes: "one" });
    k.clock.settle();
    expect(k.service.stats.slidesChecked - before).toBe(1);
    k.session.core.apply("apply_theme", { name: "Dark" });
    k.clock.settle();
    expect(k.service.stats.slidesChecked - before).toBe(4);
  });

  it("does not stop the editor when a check cannot be done, and says why", async () => {
    const k = await open();
    k.clock.settle();
    const broken = vi.spyOn(k.session.core, "lintProbes").mockImplementation(() => {
      throw new Error("the engine is gone");
    });
    put(k, k.slides[1]!);
    k.clock.settle();
    expect(k.service.stats.failures).toBe(1);
    expect(k.service.stats.lastFailure).toBe("the engine is gone");
    // The next change is checked again, and this time it works.
    broken.mockRestore();
    put(k, k.slides[1]!);
    k.clock.settle();
    // Both boxes that were put on the slide are found, the one whose check failed too.
    expect(rules(k, k.slides[1]!)).toEqual(["off-slide", "off-slide"]);
  });
});

/** Whether a promise settles within a moment: a check that never ends is told apart from a slow one. */
const settles = (promise: Promise<unknown>, ms = 250): Promise<boolean> =>
  Promise.race([promise.then(() => true), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms))]);

describe("where the check cannot go on as usual", () => {
  afterEach(() => {
    vi.doUnmock("react-dom/server");
    vi.resetModules();
  });

  it("finishes a check of a deck that has no slides, rather than waiting for one", async () => {
    const k = (kit = await openWithoutSlides());
    expect(k.slides).toEqual([]);
    let told = 0;
    k.service.subscribe(() => (told += 1));
    expect(await settles(k.service.checkAll())).toBe(true);
    expect(k.service.getSnapshot()).toMatchObject({ checking: false, checks: 1 });
    expect(k.service.getSnapshot().issues.size).toBe(0);
    expect(told).toBeGreaterThanOrEqual(1);
    // Nothing is left waiting for the browser's idle time.
    expect(k.clock.idles).toHaveLength(0);
    expect(k.clock.timers).toHaveLength(0);
  });

  it("checks with the engine's estimate when the text measure cannot be loaded, and says so", async () => {
    // A fresh copy of the editor, whose measure has not been loaded yet; the page then loses the chunk that holds it.
    vi.resetModules();
    const fresh = await import("./test-kit.ts");
    vi.doMock("react-dom/server", () => {
      throw new Error("Failed to fetch dynamically imported module");
    });
    const k = (kit = await fresh.openLinted(2));
    const [, first, second] = k.slides;
    k.session.core.apply("add_elements", {
      slide: first!,
      elements: [
        {
          type: "text",
          id: "crowded",
          x: 100,
          y: 100,
          w: 120,
          h: 24,
          text: { paragraphs: [{ runs: [{ t: "Far more words than a box this small can hold, however they are wrapped, so that the text runs out of it." }] }] },
        },
        fresh.offEdge("wide"),
      ],
    });
    // The load fails; the service says so, and goes on with what the engine can work out itself.
    await vi.waitFor(() => expect(k.service.getSnapshot().estimated).toBe(true));
    expect(k.service.stats.measureFailure).not.toBe("");
    k.clock.settle();
    expect(k.service.stats.slidesChecked).toBe(3);
    expect(k.service.stats.failures).toBe(0);
    expect(k.service.issuesOf(first!).map((i) => [i.rule, i.element])).toEqual([
      ["text-overflow", "crowded"],
      ["off-slide", "wide"],
    ]);
    expect(k.service.issuesOf(second!)).toEqual([]);
    // The rule was checked, on an estimate: it is not one of the rules that could not be.
    expect(k.service.getSnapshot().skipped.map((s) => s.rule)).toEqual(["unresolved-citation"]);
    // Asked again, the check ends all the same.
    const again = k.service.checkAll();
    k.clock.settle();
    expect(await settles(again)).toBe(true);
    expect(k.service.getSnapshot()).toMatchObject({ checking: false, checks: 1, estimated: true });
  });
});
