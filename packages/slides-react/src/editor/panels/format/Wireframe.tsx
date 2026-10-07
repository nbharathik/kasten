import type { Layout, PlaceholderDef } from "@kasten-slides/wasm";

import "./wireframe.css";

/** The roles that hold a line or two of large words, drawn as one heavy bar. */
const HEADINGS = new Set(["title", "number", "quote"]);
/** The roles that hold a single small line. */
const LABELS = new Set(["subtitle", "caption", "label", "label2"]);

/** How many bars of text a slot of this role and height shows. */
function barsIn(slot: PlaceholderDef): number {
  if (HEADINGS.has(slot.role) || LABELS.has(slot.role)) return 1;
  return Math.min(5, Math.max(2, Math.floor(slot.h / 44)));
}

function Slot({ slot }: { slot: PlaceholderDef }) {
  const { x, y, w, h } = slot;
  if (slot.kind === "image") {
    return (
      <g>
        <rect className="ks-wf-image" x={x} y={y} width={w} height={h} rx={6} vectorEffect="non-scaling-stroke" />
        <path className="ks-wf-cross" d={`M${x} ${y}L${x + w} ${y + h}M${x + w} ${y}L${x} ${y + h}`} vectorEffect="non-scaling-stroke" />
      </g>
    );
  }
  const bars = barsIn(slot);
  const across = Math.min(14, w * 0.06);
  const pad = Math.min(16, h * 0.22);
  const step = bars > 1 ? Math.min(30, (h - 2 * pad) / (bars - 1)) : 0;
  const block = step * (bars - 1);
  const valign = slot.valign ?? "top";
  const start = valign === "bottom" ? y + h - pad - block : valign === "middle" ? y + h / 2 - block / 2 : y + pad;
  const heavy = HEADINGS.has(slot.role);
  return (
    <g>
      <rect className="ks-wf-text" x={x} y={y} width={w} height={h} rx={4} vectorEffect="non-scaling-stroke" />
      {Array.from({ length: bars }, (_, i) => {
        // The last bar of a paragraph stops short; a heading keeps to the left.
        const last = i === bars - 1 && bars > 1;
        const end = x + w - across - (last ? (w - 2 * across) * 0.4 : heavy ? (w - 2 * across) * 0.25 : 0);
        const at = start + i * step;
        return <line key={i} className={`ks-wf-bar${heavy ? " is-heavy" : ""}`} x1={x + across} x2={end} y1={at} y2={at} vectorEffect="non-scaling-stroke" />;
      })}
    </g>
  );
}

/** A layout drawn as boxes: where its slots sit on the slide, and whether each holds words or a picture. */
export function Wireframe({ layout, size }: { layout: Layout; size: { w: number; h: number } }) {
  return (
    <svg className="ks-wf" viewBox={`0 0 ${size.w} ${size.h}`} aria-hidden="true">
      <rect className="ks-wf-page" x={0} y={0} width={size.w} height={size.h} vectorEffect="non-scaling-stroke" />
      {layout.placeholders.map((slot) => (
        <Slot key={slot.role} slot={slot} />
      ))}
    </svg>
  );
}
