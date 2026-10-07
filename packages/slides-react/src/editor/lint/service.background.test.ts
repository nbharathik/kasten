// The lint service checks by itself in the background only while something shows what it finds (the filmstrip's badges).
// With nothing showing, it does no work of its own; the Lint dialog asks for a check when it opens.

import { setReferences } from "@kasten-slides/wasm";
import { afterEach, describe, expect, it } from "vitest";

import type { LintOptions } from "./service.ts";
import { lintOf } from "./service.ts";
import { type Kit, offEdge, openLinted } from "./test-kit.ts";

let kit: Kit | null = null;
afterEach(() => {
  setReferences(null);
  kit?.service.dispose();
  void kit?.session.dispose();
  kit = null;
});

async function open(options: LintOptions = {}, blank = 2): Promise<Kit> {
  kit = await openLinted(blank, options);
  return kit;
}

const put = (k: Kit, slide: string, id = "") => k.session.core.apply("add_elements", { slide, elements: [offEdge(id)] });
const rules = (k: Kit, slide: string) => k.service.issuesOf(slide).map((i) => i.rule);

describe("a service with the background off", () => {
  it("does no work of its own: no timer, no idle time, no check, whatever happens to the deck", async () => {
    const k = await open({ background: false });
    expect(k.service.background).toBe(false);
    expect(k.clock.set).toBe(0);
    expect(k.clock.idles).toHaveLength(0);

    put(k, k.slides[1]!, "wide");
    k.session.slides.add();
    expect(k.clock.set).toBe(0);
    k.clock.settle();
    expect(k.service.stats.slidesChecked).toBe(0);
    expect(k.service.getSnapshot().issues.size).toBe(0);
    // Fonts arriving or a new bibliography would look at everything again, when something is showing what it finds.
    setReferences("@book{a, title={A}}");
    expect(k.clock.set).toBe(0);
    expect(k.clock.idles).toHaveLength(0);
  });

  it("still checks every slide when it is asked to (the Lint dialog does), and goes quiet again after", async () => {
    const k = await open({ background: false });
    put(k, k.slides[1]!, "wide");
    const done = k.service.checkAll();
    expect(k.service.getSnapshot().checking).toBe(true);
    k.clock.settle();
    await done;
    expect(k.service.stats.slidesChecked).toBe(3);
    expect(rules(k, k.slides[1]!)).toEqual(["off-slide"]);
    expect(k.service.getSnapshot().checking).toBe(false);

    const set = k.clock.set;
    put(k, k.slides[2]!, "another");
    expect(k.clock.set).toBe(set);
    k.clock.settle();
    expect(k.service.stats.slidesChecked).toBe(3);
  });

  it("checks what changed while it was off, once it is turned on", async () => {
    const k = await open({ background: false });
    put(k, k.slides[1]!, "wide");
    k.service.setBackground(true);
    expect(k.service.background).toBe(true);
    // The wasm side of the measure is ready, so the first pass waits only for the page's idle time.
    await Promise.resolve();
    k.clock.settle();
    expect(k.service.stats.slidesChecked).toBe(3);
    expect(rules(k, k.slides[1]!)).toEqual(["off-slide"]);
    // And it follows the deck again.
    put(k, k.slides[2]!, "more");
    k.clock.settle();
    expect(rules(k, k.slides[2]!)).toEqual(["off-slide"]);
  });
});

describe("switching the background off while it works", () => {
  it("cancels the wait and the idle time that were set, and checks nothing more", async () => {
    const k = await open();
    k.clock.settle();
    const checked = k.service.stats.slidesChecked;
    put(k, k.slides[1]!, "wide");
    expect(k.clock.timers).toHaveLength(1);
    k.service.setBackground(false);
    expect(k.clock.timers).toHaveLength(0);
    expect(k.clock.idles).toHaveLength(0);
    k.clock.settle();
    expect(k.service.stats.slidesChecked).toBe(checked);
    expect(k.service.issuesOf(k.slides[1]!)).toEqual([]);

    k.service.setBackground(true);
    await Promise.resolve();
    k.clock.settle();
    expect(rules(k, k.slides[1]!)).toEqual(["off-slide"]);
  });

  it("stops between two slices of work, but does not stop a check that was asked for", async () => {
    const k = await open({}, 4);
    // One slide of the first pass is done and more idle time is asked for.
    k.clock.runIdle(10, 20);
    expect(k.service.stats.slidesChecked).toBe(1);
    expect(k.clock.idles).toHaveLength(1);
    k.service.setBackground(false);
    expect(k.clock.idles).toHaveLength(0);
    expect(k.clock.runIdle()).toBe(0);
    expect(k.service.stats.slidesChecked).toBe(1);

    const done = k.service.checkAll();
    k.service.setBackground(false);
    k.clock.runIdle(10, 20);
    // The asked-for check goes on to the end, slice by slice, though the background is off.
    expect(k.clock.idles).toHaveLength(1);
    k.clock.settle();
    await done;
    expect(k.service.stats.slidesChecked).toBeGreaterThanOrEqual(6);
  });

  it("is a no-op to switch to what it already is, and after it is disposed", async () => {
    const k = await open();
    k.service.setBackground(true);
    expect(k.clock.set).toBe(0);
    k.service.dispose();
    k.service.setBackground(false);
    expect(k.service.background).toBe(true);
  });
});

describe("the service the editor makes for a session", () => {
  it("starts with the background off, so the badges being off costs nothing", async () => {
    const k = await open();
    const made = lintOf(k.session);
    expect(made.background).toBe(false);
    made.dispose();
  });
});
