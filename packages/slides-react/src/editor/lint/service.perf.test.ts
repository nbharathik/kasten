// The cost of linting while editing, on a deck of 60 slides. A change must not
// wait on lint: the work done in the change itself is comparing the slides
// with the ones seen last and setting one timer, and it must stay well under
// the 4 ms a frame can spare.

import { afterEach, describe, expect, it } from "vitest";

import { newDeck } from "../../test/engine.ts";
import { MemoryHost } from "../memory-host.ts";
import { EditorSession } from "../session/session.ts";
import { loadMeasurer } from "./measure.ts";
import { LintService } from "./service.ts";
import { ManualScheduler, offEdge } from "./test-kit.ts";

const SLIDES = 60;
/** What the change itself may spend on lint, in milliseconds. */
const BUDGET_MS = 4;

let opened: { service: LintService; session: EditorSession } | null = null;
afterEach(() => {
  opened?.service.dispose();
  void opened?.session.dispose();
  opened = null;
});

async function deck60(): Promise<{ service: LintService; session: EditorSession; clock: ManualScheduler }> {
  const engine = await newDeck("Sixty");
  for (let i = 1; i < SLIDES; i++) {
    engine.apply("add_slide", { layout: "title-body", content: { title: `Slide ${i + 1}`, body: `- a point on slide ${i + 1}\n- and another one` } });
  }
  const session = new EditorSession(engine, new MemoryHost(), { saveDelay: 600_000 });
  await loadMeasurer();
  const clock = new ManualScheduler();
  const service = new LintService(session, { scheduler: clock });
  await Promise.resolve();
  opened = { service, session };
  return { service, session, clock };
}

const percentile = (sorted: number[], p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;

describe("what lint costs the editor, on a deck of 60 slides", () => {
  it("adds under 4 ms to a change, and sets one timer however many changes come", async () => {
    const { service, session, clock } = await deck60();
    expect(session.deck.slides).toHaveLength(SLIDES);
    clock.settle();
    expect(service.stats.slidesChecked).toBe(SLIDES);

    const slides = session.deck.slides.map((s) => s.id);
    const spent: number[] = [];
    clock.set = 0;
    for (let i = 0; i < 300; i++) {
      const before = service.stats.followMs;
      session.core.apply("set_notes", { slide: slides[(i * 7) % SLIDES]!, notes: `note ${i}` });
      spent.push(service.stats.followMs - before);
    }
    const sorted = [...spent].sort((a, b) => a - b);
    const mean = spent.reduce((a, b) => a + b, 0) / spent.length;
    const stats = { mean: +mean.toFixed(3), p50: +percentile(sorted, 0.5).toFixed(3), p95: +percentile(sorted, 0.95).toFixed(3), max: +sorted[sorted.length - 1]!.toFixed(3) };
    console.info(`lint work inside a change, 60 slides, 300 changes (ms): ${JSON.stringify(stats)}`);
    expect(service.stats.follows).toBeGreaterThanOrEqual(300);
    expect(percentile(sorted, 0.95)).toBeLessThan(BUDGET_MS);
    expect(mean).toBeLessThan(1);
    // Every change restarted the one wait; none started a check.
    expect(clock.timers).toHaveLength(1);
    expect(clock.idles).toHaveLength(0);

    // The 300 changes touched all 60 slides once quiet came, and the work needed no more than that.
    const before = service.stats.slidesChecked;
    clock.settle();
    expect(service.stats.slidesChecked - before).toBe(SLIDES);
  });

  it("finds a problem on one slide of sixty without checking the other fifty-nine again", async () => {
    const { service, session, clock } = await deck60();
    clock.settle();
    const slide = session.deck.slides[41]!.id;
    const before = service.stats.slidesChecked;
    const withProblems = service.getSnapshot().issues.size;
    session.core.apply("add_elements", { slide, elements: [offEdge("wide")] });
    clock.settle();
    expect(service.stats.slidesChecked - before).toBe(1);
    // The box hangs off the edge and lies over the slide's own text.
    expect(service.issuesOf(slide).map((i) => i.rule)).toContain("off-slide");
    expect(service.getSnapshot().issues.size).toBe(withProblems + 1);
  });

  it("checks sixty slides in slices, none longer than the idle time it is given", async () => {
    const { service, clock } = await deck60();
    // A slice of 30 ms in which each look at the clock costs 20: a slide is checked, and if 3 ms or more are left, one more.
    let slices = 0;
    while (clock.idles.length > 0) {
      const before = service.stats.slidesChecked;
      clock.runIdle(30, 20);
      slices += 1;
      expect(service.stats.slidesChecked - before).toBeLessThanOrEqual(2);
      expect(slices).toBeLessThan(200);
    }
    expect(service.stats.slidesChecked).toBe(SLIDES);
    expect(slices).toBe(SLIDES / 2);
  });
});
