// Presenting a deck: a window-sized stage, on reveal.js through `@revealjs/react`, that shows the deck's slides one at a
// time with the renderer, at their own size. reveal.js does the moving (keys, steps, backup slides, the overview, the
// black screen, morphs); everything a slide looks like is the renderer's. Nothing is fetched: it all runs offline.

import { Deck as RevealDeck, type DeckProps } from "@revealjs/react";
import { type Deck, picturePaths } from "@kasten-slides/wasm";
import type { RevealApi } from "reveal.js";
import { type JSX, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";

import { posterPaths } from "../export/posters.ts";
import type { ImageUrl } from "../render/index.ts";
import { DeckTree } from "./DeckTree.tsx";
import { type Plan, type Position, fromState, planOf, startPosition } from "./plan.ts";
import { installRevealCss } from "./reveal-css.ts";
import { attachChrome } from "./runtime/chrome.js";
import { revealConfig } from "./runtime/config.js";
import { animateMorph, matchSlides } from "./runtime/morph.js";
import { ScrollView } from "./ScrollView.tsx";
import { PresentStore } from "./store.ts";
import type { PresentSync } from "./sync.ts";
import "./present.css";

export interface PresentModeProps {
  deck: Deck;
  /** Where to begin: the place of a slide among the deck's slides, hidden ones counted. */
  start: number;
  /** Turns an image path stored in the deck into a URL the page can load. Give a function that stays the same between renders. */
  imageUrl: ImageUrl;
  /** Called when the person leaves (Esc, or the button in the scroll view). */
  onExit(): void;
  /** The link to the presenter's window, if one is open: the two follow each other. */
  sync?: PresentSync | null;
  /** What the S key does. */
  onPresenter?: () => void;
  /** What the F key does, where the host has a better full screen than the page's own. */
  fullscreen?: () => void;
  /** The slides one at a time (the default), or the deck as one page that scrolls, with its notes. */
  view?: "slides" | "scroll";
}

/** The addresses of the pictures a deck names, for a window that cannot ask the host itself. */
export function imagesOf(deck: Deck, imageUrl: ImageUrl): Record<string, string> {
  const found: Record<string, string> = {};
  for (const path of new Set([...picturePaths(deck), ...posterPaths(deck)])) {
    const url = imageUrl(path);
    if (url) found[path] = url;
  }
  return found;
}

/** The events of reveal.js that change where the person is. */
const MOVES = ["ready", "slidechanged", "fragmentshown", "fragmenthidden", "overviewshown", "overviewhidden", "paused", "resumed"] as const;

function locator(plan: Plan): (number: number) => [number, number] | null {
  const bySlide = new Map(plan.columns.flatMap((column, h) => column.slides.map((slide, v) => [plan.numbers.get(slide.id) ?? 0, [h, v] as [number, number]] as const)));
  return (number) => bySlide.get(Math.min(Math.max(Math.trunc(number) || 1, 1), plan.count)) ?? null;
}

function SlideShow({ deck, start, imageUrl, onExit, sync, onPresenter, fullscreen }: PresentModeProps): JSX.Element {
  const plan = useMemo(() => planOf(deck), [deck]);
  const store = useMemo(() => new PresentStore(startPosition(plan, start)), [plan, start]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  // Slides near the one on the screen are drawn a moment after it, so that getting to a slide is never held up by them.
  const around = useDeferredValue(snapshot.position.h);
  const [reveal, setReveal] = useState<RevealApi | null>(null);
  const [started, setStarted] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const tools = useRef<HTMLDivElement>(null);
  const applying = useRef(false);
  const since = useRef(Date.now());
  const latest = useRef({ onExit, onPresenter, fullscreen, sync, plan, store });
  useEffect(() => {
    latest.current = { onExit, onPresenter, fullscreen, sync, plan, store };
  });

  useLayoutEffect(() => installRevealCss(), []);

  // Keys go to the stage, not to whatever had the focus before it.
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    before?.blur();
    stage.current?.focus({ preventScroll: true });
    return () => before?.focus({ preventScroll: true });
  }, []);

  const config = useMemo(() => revealConfig(deck.size, { autoAnimateMatcher: matchSlides }) as DeckProps["config"], [deck.size.w, deck.size.h]);

  // Once reveal.js is up: follow it, give it the presentation's keys and morphs, and take it to where the person asked to begin.
  const teardown = useRef<(() => void) | null>(null);
  const ready = useCallback((instance: RevealApi) => {
    const { plan: current, store: held } = latest.current;
    const commit = () => {
      const state = instance.getState();
      const next = { position: fromState(current, state), overview: Boolean(state.overview), paused: Boolean(state.paused) };
      // In step with reveal.js, before it goes on (a morph measures the slides as they are drawn by then). The time it takes is
      // measured (`ks-present:draw`), for a check that a step or a slide starts to show within 50 ms.
      const began = performance.now();
      flushSync(() => void held.set(next));
      performance.measure("ks-present:draw", { start: began });
      if (!applying.current) latest.current.sync?.post({ type: "state", state });
    };
    for (const type of MOVES) instance.on(type, commit);
    instance.on("autoanimate", animateMorph as unknown as EventListener);
    const chrome = attachChrome(instance, tools.current as HTMLElement, {
      locate: locator(current),
      onExit: () => latest.current.onExit(),
      onPresenter: () => latest.current.onPresenter?.(),
      ...(latest.current.fullscreen ? { fullscreen: () => latest.current.fullscreen?.() } : {}),
      ...(stage.current ? { fullscreenTarget: stage.current } : {}),
    });
    teardown.current = () => {
      for (const type of MOVES) instance.off(type, commit);
      instance.off("autoanimate", animateMorph as unknown as EventListener);
      chrome.destroy();
    };
    const at: Position = held.getSnapshot().position;
    instance.slide(at.h, at.v, at.f);
    setReveal(instance);
    requestAnimationFrame(() => setStarted(true));
  }, []);
  useEffect(
    () => () => {
      teardown.current?.();
      teardown.current = null;
    },
    [],
  );

  // The presenter's window: it gets the deck when it asks, and the two follow each other.
  useEffect(() => {
    if (!reveal || !sync) return;
    const introduce = () => sync.post({ type: "deck", deck, images: imagesOf(deck, imageUrl), state: reveal.getState(), since: since.current });
    const stop = sync.subscribe((message) => {
      if (message.type === "hello") introduce();
      else if (message.type === "state") {
        applying.current = true;
        try {
          // reveal.js takes a state with any part left out; its typing says every part is there.
          reveal.setState(message.state as unknown as Parameters<RevealApi["setState"]>[0]);
        } finally {
          applying.current = false;
        }
      }
    });
    introduce();
    return stop;
  }, [reveal, sync, deck, imageUrl]);

  return (
    <div ref={stage} className={`ks-show${started ? "" : " is-starting"}`} role="dialog" aria-label={`Presenting ${deck.title}`} tabIndex={-1} data-paused={snapshot.paused || undefined}>
      <RevealDeck className="ks-show-reveal" config={config} onReady={ready}>
        <DeckTree plan={plan} position={snapshot.position} overview={snapshot.overview} around={around} imageUrl={imageUrl} />
      </RevealDeck>
      <div ref={tools} className="ks-show-chrome" />
    </div>
  );
}

/** The presentation, over the whole window. */
export function PresentMode(props: PresentModeProps): JSX.Element {
  return props.view === "scroll" ? <ScrollView deck={props.deck} imageUrl={props.imageUrl} onExit={props.onExit} /> : <SlideShow {...props} />;
}
