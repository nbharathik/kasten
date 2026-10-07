// What the tests of lint share: a real deck in a real session, and a clock the test winds by hand.

import { DeckEngine, type Element } from "@kasten-slides/wasm";

import { newDeck } from "../../test/engine.ts";
import { MemoryHost } from "../memory-host.ts";
import { EditorSession } from "../session/session.ts";
import { loadMeasurer } from "./measure.ts";
import { type LintOptions, LintService, type Scheduler } from "./service.ts";

/** A clock and an idle queue that only move when the test says so. */
export class ManualScheduler implements Scheduler {
  timers: { at: number; run: () => void }[] = [];
  idles: ((left: () => number) => void)[] = [];
  private now = 0;
  /** How many timers were set, cancelled ones included. */
  set = 0;

  after(ms: number, run: () => void): () => void {
    const timer = { at: this.now + ms, run };
    this.timers.push(timer);
    this.set += 1;
    return () => {
      this.timers = this.timers.filter((t) => t !== timer);
    };
  }

  idle(run: (left: () => number) => void): () => void {
    this.idles.push(run);
    return () => {
      this.idles = this.idles.filter((r) => r !== run);
    };
  }

  /** Winds the clock on; timers that fall due run. */
  advance(ms: number): void {
    this.now += ms;
    const due = this.timers.filter((t) => t.at <= this.now);
    this.timers = this.timers.filter((t) => t.at > this.now);
    for (const timer of due) timer.run();
  }

  /** Runs the idle callbacks that are waiting. Each may work for `budget` milliseconds; a call to `left` uses up `cost` of it. */
  runIdle(budget = 1000, cost = 0): number {
    const waiting = this.idles.splice(0);
    for (const run of waiting) {
      let left = budget;
      run(() => (left -= cost));
    }
    return waiting.length;
  }

  /** Lets the quiet period pass and the idle time come: everything that was waiting for either is done. */
  settle(): void {
    for (let i = 0; i < 50 && (this.timers.length > 0 || this.idles.length > 0); i++) {
      if (this.timers.length > 0) this.advance(1000);
      this.runIdle();
    }
  }
}

export interface Kit {
  session: EditorSession;
  service: LintService;
  clock: ManualScheduler;
  /** The ids of the slides: the title slide, then `blank` blank ones. */
  slides: string[];
}

/** Text that hangs off the right edge of the slide: one error (`off-slide`). */
export const offEdge = (id = ""): Element =>
  ({ type: "text", id, x: 800, y: 100, w: 400, h: 60, text: { paragraphs: [{ runs: [{ t: "Off the edge" }] }] } }) as Element;

/** A lint service that has not run yet, on a deck in a session. */
async function lintedOver(engine: DeckEngine, options: LintOptions = {}): Promise<Kit> {
  const session = new EditorSession(engine, new MemoryHost(), { saveDelay: 60_000 });
  // A page that cannot load the measurer is a case of its own: the service is made without it.
  await loadMeasurer().catch(() => undefined);
  const clock = new ManualScheduler();
  const service = new LintService(session, { scheduler: clock, ...options });
  // The service starts its first pass once the measurer is ready.
  await Promise.resolve();
  return { session, service, clock, slides: session.deck.slides.map((s) => s.id) };
}

/** A deck of a finished title slide and `blank` empty slides, in a session, with a lint service that has not run yet (made with `options`). */
export async function openLinted(blank = 2, options: LintOptions = {}): Promise<Kit> {
  const engine = await newDeck("Lint");
  const cover = engine.deck.slides[0]!;
  const subtitle = cover.elements.find((e) => e.placeholder === "subtitle")!;
  engine.apply("set_text", { slide: cover.id, id: subtitle.id, markdown: "A subtitle" });
  for (let i = 0; i < blank; i++) engine.apply("add_slide", { layout: "blank" });
  return lintedOver(engine, options);
}

/** A deck with no slide at all (a file can hold one) in a session, with a lint service that has not run yet. */
export async function openWithoutSlides(): Promise<Kit> {
  const full = await newDeck("Lint");
  return lintedOver(DeckEngine.open(JSON.stringify({ ...full.deck, slides: [] })));
}
