import { HANDLES, type Handle, type Item, type Rect } from "@kasten-slides/canvas";
import type { Element } from "@kasten-slides/wasm";

import type { Preview } from "./controller.ts";
import { MoveHandles } from "./MoveHandle.tsx";

interface OverlayProps {
  /** Pixels on screen per slide unit. */
  zoom: number;
  /** The selected elements, with any preview position applied. */
  selected: readonly { item: Item; element: Element }[];
  /** The box round several selected elements. */
  group: Rect | null;
  hovered: Item | null;
  preview: Preview;
  /** The select tool is in hand, which is when the move handles are there to be grabbed. */
  active: boolean;
}

const CURSORS: Record<Handle, string> = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize" };
const AT: Record<Handle, [string, string]> = {
  nw: ["0%", "0%"],
  n: ["50%", "0%"],
  ne: ["100%", "0%"],
  e: ["100%", "50%"],
  se: ["100%", "100%"],
  s: ["50%", "100%"],
  sw: ["0%", "100%"],
  w: ["0%", "50%"],
};

const px = (n: number, zoom: number) => n * zoom;

function frame(item: { x: number; y: number; w: number; h: number; rotation?: number }, zoom: number) {
  return { left: px(item.x, zoom), top: px(item.y, zoom), width: px(item.w, zoom), height: px(item.h, zoom), transform: item.rotation ? `rotate(${item.rotation}deg)` : undefined } as const;
}

function Handles({ rotate }: { rotate: boolean }) {
  return (
    <>
      {HANDLES.map((handle) => {
        const [left, top] = AT[handle];
        return <span key={handle} className="ks-handle" data-handle={handle} style={{ left, top, cursor: CURSORS[handle] }} />;
      })}
      {rotate ? (
        <>
          <span className="ks-rotate-stem" />
          <span className="ks-handle ks-rotate" data-rotate="" />
        </>
      ) : null}
    </>
  );
}

/** A line's own two ends, where its box runs from top left to bottom right unless flipped. */
function Ends({ item, element, zoom }: { item: Item; element: Element; zoom: number }) {
  const fh = element.flipH ?? false;
  const fv = element.flipV ?? false;
  const dot = (end: "start" | "end", x: number, y: number) => <span key={end} className="ks-handle ks-end" data-end={end} style={{ left: px(x, zoom), top: px(y, zoom) }} />;
  return (
    <>
      {dot("start", fh ? item.x + item.w : item.x, fv ? item.y + item.h : item.y)}
      {dot("end", fh ? item.x : item.x + item.w, fv ? item.y : item.y + item.h)}
    </>
  );
}

/** Everything drawn over the slide that is not the slide: outlines, handles, guides, the selection rectangle and the shape being drawn. Sized in screen pixels so lines and handles stay crisp at any zoom. */
export function Overlay({ zoom, selected, group, hovered, preview, active }: OverlayProps) {
  const only = selected.length === 1 ? selected[0] : undefined;
  const isLine = only?.element.type === "line" || only?.element.type === "connector";
  const locked = selected.length > 0 && selected.every(({ item }) => item.locked);
  const angle = preview.angle;
  return (
    <div className="ks-overlay" aria-hidden="true">
      {hovered && !selected.some(({ item }) => item.id === hovered.id) ? <div className="ks-outline is-hover" style={frame(hovered, zoom)} /> : null}
      {selected.map(({ item }) => (
        <div key={item.id} className={`ks-outline${item.locked ? " is-locked" : ""}`} style={frame(item, zoom)}>
          {only && !isLine && !item.locked ? <Handles rotate /> : null}
        </div>
      ))}
      {only && isLine && !only.item.locked ? <Ends item={only.item} element={only.element} zoom={zoom} /> : null}
      {group && selected.length > 1 && !locked ? (
        <div className="ks-outline is-group" style={frame(group, zoom)}>
          <Handles rotate />
        </div>
      ) : null}
      <MoveHandles zoom={zoom} selected={selected.map(({ item }) => item)} group={group} hovered={hovered} gesture={preview.gesture} active={active} />
      {preview.guides.map((guide, i) => (
        <div
          key={i}
          className={`ks-guide is-${guide.kind}`}
          style={
            guide.axis === "x"
              ? { left: px(guide.at, zoom), top: px(guide.from, zoom), width: 1, height: px(guide.to - guide.from, zoom) }
              : { top: px(guide.at, zoom), left: px(guide.from, zoom), height: 1, width: px(guide.to - guide.from, zoom) }
          }
        />
      ))}
      {preview.marquee ? <div className="ks-marquee" style={frame(preview.marquee, zoom)} /> : null}
      {preview.drawing ? <Drawing drawing={preview.drawing} zoom={zoom} /> : null}
      {angle !== null ? <div className="ks-angle">{Math.round(angle)}°</div> : null}
    </div>
  );
}

function Drawing({ drawing, zoom }: { drawing: NonNullable<Preview["drawing"]>; zoom: number }) {
  const { from, to, tool } = drawing;
  if (tool.startsWith("line:") || tool.startsWith("arrow:")) {
    return (
      <svg className="ks-drawing-line" width="100%" height="100%">
        <line x1={px(from.x, zoom)} y1={px(from.y, zoom)} x2={px(to.x, zoom)} y2={px(to.y, zoom)} />
      </svg>
    );
  }
  return <div className="ks-drawing" style={frame({ x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), w: Math.abs(to.x - from.x), h: Math.abs(to.y - from.y) }, zoom)} />;
}

