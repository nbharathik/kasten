// Every slide of a deck in one picture, each with its number and title under it: the overview an agent (or a
// person at a terminal) looks at to see the deck's rhythm and to find the slide that needs work.

import type { Deck, Slide } from "@kasten-slides/wasm";
import { type ImageUrl, SlideView, slideTitle } from "@kasten-slides/react/render-host";
import type { CSSProperties, JSX } from "react";

/** The width of the whole picture, unless the caller asks for another. */
export const GRID_WIDTH = 1600;
/** No picture is taller than this: browsers refuse bigger pages, and so do the models that look at them. */
const MAX_HEIGHT = 12_000;
const PAD = 20;
const GAP = 18;
const LABEL = 34;

/** How many columns a deck of `count` slides is laid out in when the caller does not say. */
export function autoColumns(count: number): number {
  if (count <= 3) return Math.max(1, count);
  if (count === 4) return 2;
  if (count <= 6) return 3;
  if (count <= 12) return 4;
  return 5;
}

export interface GridLayout {
  columns: number;
  /** A thumbnail, in pixels. */
  thumb: { w: number; h: number };
  /** How much smaller than the slide it is drawn. */
  scale: number;
  width: number;
  height: number;
}

/** Where the thumbnails go: as wide as `width` in all, in `columns` columns, and no taller than a picture can be. */
export function gridLayout(count: number, size: { w: number; h: number }, columns: number | null | undefined, width: number | null | undefined): GridLayout {
  const across = Math.max(1, Math.min(Math.floor(columns ?? autoColumns(count)) || 1, Math.max(1, count)));
  const total = Math.max(320, Math.round(width ?? GRID_WIDTH));
  const thumbWidth = Math.max(40, Math.floor((total - 2 * PAD - GAP * (across - 1)) / across));
  const scale = thumbWidth / size.w;
  const thumbHeight = Math.max(1, Math.round(size.h * scale));
  const rows = Math.max(1, Math.ceil(count / across));
  const height = 2 * PAD + rows * (thumbHeight + LABEL) + (rows - 1) * GAP;
  return { columns: across, thumb: { w: thumbWidth, h: thumbHeight }, scale, width: total, height: Math.min(height, MAX_HEIGHT) };
}

const CAPTION: CSSProperties = { display: "flex", alignItems: "baseline", gap: 8, height: LABEL, boxSizing: "border-box", paddingTop: 8, font: "500 14px/18px Inter, system-ui, sans-serif", color: "#2b2a28", whiteSpace: "nowrap", overflow: "hidden" };

/** The slide's own last state: what a person sees when the slide has finished building. */
export const finalStep = (slide: Slide): number | undefined => ((slide.steps ?? 0) > 0 ? slide.steps : undefined);

/** A slide's place among the slides shown, counting itself when it is hidden. */
export function numberOf(deck: Deck, slide: Slide): number {
  return deck.slides.filter((s) => !s.hidden || s === slide).indexOf(slide) + 1;
}

function Tag({ children }: { children: string }): JSX.Element {
  return <span style={{ flex: "none", font: "600 11px/16px Inter, system-ui, sans-serif", padding: "0 6px", borderRadius: 8, background: "#dcd9d2", color: "#4a4843" }}>{children}</span>;
}

export function Grid({ deck, layout, imageUrl }: { deck: Deck; layout: GridLayout; imageUrl: ImageUrl }): JSX.Element {
  const count = deck.slides.filter((slide) => !slide.hidden).length;
  return (
    <div
      style={{ width: layout.width, height: layout.height, boxSizing: "border-box", padding: PAD, overflow: "hidden", background: "#e9e7e2", display: "grid", gridTemplateColumns: `repeat(${layout.columns}, ${layout.thumb.w}px)`, gridAutoRows: layout.thumb.h + LABEL, gap: GAP }}
    >
      {deck.slides.map((slide, index) => (
        <figure key={slide.id} data-slide={slide.id} style={{ margin: 0, width: layout.thumb.w }}>
          <div style={{ position: "relative", width: layout.thumb.w, height: layout.thumb.h, overflow: "hidden", background: "#fff", boxShadow: "0 0 0 1px rgba(0,0,0,.16), 0 2px 6px rgba(0,0,0,.14)", opacity: slide.hidden ? 0.55 : 1 }}>
            <div style={{ position: "absolute", left: 0, top: 0, transform: `scale(${layout.scale})`, transformOrigin: "0 0" }}>
              <SlideView deck={deck} slide={slide} number={numberOf(deck, slide)} count={count} step={finalStep(slide)} mode="export" imageUrl={imageUrl} />
            </div>
          </div>
          <figcaption style={CAPTION}>
            <b style={{ flex: "none", font: "700 14px/18px Inter, system-ui, sans-serif" }}>{index + 1}</b>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{slideTitle(slide)}</span>
            {slide.hidden ? <Tag>hidden</Tag> : null}
            {slide.backup ? <Tag>backup</Tag> : null}
            {(slide.steps ?? 0) > 0 ? <Tag>{`${slide.steps} steps`}</Tag> : null}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
