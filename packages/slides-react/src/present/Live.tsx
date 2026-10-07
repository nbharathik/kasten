// The live part of a slide: an embedded page runs in a frame over its box, a video plays in place of its
// still. Both are on top of what the slide draws for them (their poster or panel), so when a page cannot be
// reached or a video cannot be played the slide still shows that, and never a broken frame.

import type { Deck, Element, Slide } from "@kasten-slides/wasm";
import { type CSSProperties, type JSX, useEffect, useMemo, useRef, useState } from "react";

import { stateAt } from "../render/index.ts";
import type { ImageUrl } from "../render/index.ts";
import { type Box, boxOf } from "../theme/index.ts";
import { EMBED_SECONDS, answers, embedSandbox, embedUrl } from "./live-url.ts";

type Embed = Extract<Element, { type: "embed" }>;
type Video = Extract<Element, { type: "video" }>;

interface Item {
  element: Embed | Video;
  box: Box;
  opacity: number;
}

/** The embeds and videos a slide shows at a step: not the ones a step hides, nor those in a group it hides. */
export function liveItems(deck: Deck, slide: Slide, step: number): Item[] {
  const found: Item[] = [];
  const walk = (elements: readonly Element[], hidden: boolean): void => {
    for (const element of elements) {
      const state = stateAt(element, step);
      if (element.type === "group") {
        walk(element.children, hidden || state === "hidden");
      } else if ((element.type === "embed" || element.type === "video") && !hidden && state !== "hidden") {
        const box = boxOf(deck.theme, slide.layout, element);
        if (box) found.push({ element, box, opacity: (element.style?.opacity ?? 1) * (state === "dimmed" ? deck.theme.dimmedOpacity : 1) });
      }
    }
  };
  walk(slide.elements, false);
  return found;
}

function place({ box, element, opacity }: Item, extra: CSSProperties = {}): CSSProperties {
  const turn = element.rotation ? `rotate(${element.rotation}deg)` : undefined;
  return { position: "absolute", left: box.x, top: box.y, width: box.w, height: box.h, ...(turn ? { transform: turn } : {}), ...(opacity < 1 ? { opacity } : {}), ...extra };
}

export interface EmbedFrameProps {
  item: Item & { element: Embed };
  /** Seconds a page has to load. */
  seconds?: number;
  /** Asks whether an address answers; the browser's fetch when left out, and no question when null. */
  ask?: typeof fetch | null;
}

/**
 * An embedded page. It is see-through until it has loaded and the address has answered, and it goes away (so the slide's own
 * poster or panel shows) if the address does not answer or the page has not loaded in time.
 */
export function EmbedFrame({ item, seconds = EMBED_SECONDS, ask }: EmbedFrameProps): JSX.Element | null {
  const url = embedUrl(item.element.url);
  const [loaded, setLoaded] = useState(false);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [late, setLate] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!url) return;
    let live = true;
    const timer = setTimeout(() => live && setLate(true), seconds * 1000);
    void answers(url, ask).then((yes) => live && setReachable(yes));
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [url, seconds, ask]);

  // A page that refuses the connection still "loads" its error page, so the question of whether it answers has the last word.
  const ready = loaded && reachable === true;
  if (!url || reachable === false || (late && !ready)) return null;
  return (
    <div
      className="ks-show-live-item"
      style={place(item, { pointerEvents: ready ? "auto" : "none" })}
      // The keys go to the deck again once the pointer is off the page.
      onPointerLeave={() => {
        if (frame.current && document.activeElement === frame.current) {
          frame.current.blur();
          window.focus();
        }
      }}
    >
      <iframe
        ref={frame}
        className="ks-show-live-frame"
        src={url}
        title={item.element.title || item.element.alt || "Embedded page"}
        sandbox={embedSandbox(url)}
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        style={{ opacity: ready ? 1 : 0 }}
      />
    </div>
  );
}

export interface VideoPlayerProps {
  item: Item & { element: Video };
  imageUrl: ImageUrl;
}

/** A video, played in place: its still until it starts, and the still again if the file cannot be played. */
export function VideoPlayer({ item, imageUrl }: VideoPlayerProps): JSX.Element | null {
  const { element } = item;
  const src = element.src ? imageUrl(element.src) : undefined;
  const poster = element.poster ? imageUrl(element.poster) : undefined;
  const [failed, setFailed] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const node = video.current;
    if (!element.autoplay || !node) return;
    // A browser may refuse sound before the first touch; then it plays without.
    void node.play().catch(() => {
      node.muted = true;
      return node.play();
    }).catch(() => {});
  }, [element.autoplay, src]);

  if (!src || failed) return null;
  return (
    <video
      ref={video}
      className="ks-show-live-video"
      src={src}
      poster={poster}
      controls
      playsInline
      preload="metadata"
      loop={element.looped ?? false}
      data-autoplay={element.autoplay ? "" : undefined}
      aria-label={element.alt || element.name || "Video"}
      onError={() => setFailed(true)}
      style={place(item)}
    />
  );
}

export interface LiveLayerProps {
  deck: Deck;
  slide: Slide;
  step: number;
  imageUrl: ImageUrl;
}

/** The live embeds and videos of a slide, in a layer the size of the slide over it. Nothing when there are none. */
export function LiveLayer({ deck, slide, step, imageUrl }: LiveLayerProps): JSX.Element | null {
  const items = useMemo(() => liveItems(deck, slide, step), [deck, slide, step]);
  if (items.length === 0) return null;
  return (
    <div className="ks-show-live" style={{ width: deck.size.w, height: deck.size.h }}>
      {items.map((item) =>
        item.element.type === "embed" ? (
          <EmbedFrame key={item.element.id} item={{ ...item, element: item.element }} />
        ) : (
          <VideoPlayer key={item.element.id} item={{ ...item, element: item.element }} imageUrl={imageUrl} />
        ),
      )}
    </div>
  );
}
