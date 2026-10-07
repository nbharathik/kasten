import { useState } from "react";

import type { Transform } from "@kasten-slides/wasm";

import { IconButton } from "../../ui/Button.tsx";
import { NumberField, Toggle } from "../../ui/Fields.tsx";
import { Cluster } from "./controls.tsx";
import { PanelSection } from "./PanelSection.tsx";
import type { SectionProps } from "./types.ts";
import { agree, round1, round2, turnOf, unionOf } from "./values.ts";

const SHOWN = 1;

/** Position, size and turn. Several elements are moved and scaled as one: the fields show the box around them all. */
export function SizeSection({ session, elements }: SectionProps) {
  const [lock, setLock] = useState(false);
  // A locked element stays where it is, as it does on the slide.
  const movable = elements.filter((e) => !e.locked);
  const placed = movable.map((element) => ({ element, box: session.elements.boxOf(element) }));
  const boxes = placed.flatMap((p) => (p.box ? [p.box] : []));
  const around = placed.length > 0 && boxes.length === placed.length ? unionOf(boxes) : null;
  const rotation = agree(movable.map((e) => e.rotation ?? 0), 0);
  const flipH = agree(movable.map((e) => Boolean(e.flipH)), false);
  const flipV = agree(movable.map((e) => Boolean(e.flipV)), false);
  const off = around === null;
  // A line can be flat, a shape cannot.
  const least = movable.every((e) => e.type === "line" || e.type === "connector") ? 0 : SHOWN;

  const move = (axis: "x" | "y", value: number) => {
    if (!around || round1(value) === round1(around[axis])) return;
    const by = value - around[axis];
    session.elements.transform(placed.flatMap(({ element, box }) => (box ? [axis === "x" ? { id: element.id, x: round2(box.x + by) } : { id: element.id, y: round2(box.y + by) }] : [])));
  };

  const size = (axis: "w" | "h", value: number) => {
    if (!around || round1(value) === round1(around[axis])) return;
    const alone = placed.length === 1 ? placed[0] : undefined;
    if (around[axis] <= 0) {
      // Nothing to scale from (a flat line): set the one element's size directly.
      if (alone) session.elements.transform([axis === "w" ? { id: alone.element.id, w: round2(value) } : { id: alone.element.id, h: round2(value) }]);
      return;
    }
    const factor = value / around[axis];
    const sx = axis === "w" || lock ? factor : 1;
    const sy = axis === "h" || lock ? factor : 1;
    const items = placed.flatMap(({ element, box }): Transform[] =>
      box ? [{ id: element.id, x: round2(around.x + (box.x - around.x) * sx), y: round2(around.y + (box.y - around.y) * sy), w: round2(box.w * sx), h: round2(box.h * sy) }] : [],
    );
    session.elements.transform(items);
  };

  const turn = (degrees: number) => {
    const angle = turnOf(degrees);
    // A group is turned by a number of degrees; the rest are set to an angle.
    session.elements.transform(movable.flatMap((e): Transform[] => (round1(angle) === round1(e.rotation ?? 0) && e.type !== "group" ? [] : [{ id: e.id, rotation: e.type === "group" ? round2(angle - (e.rotation ?? 0)) : angle }])));
  };

  const flip = (axis: "flipH" | "flipV", now: boolean | "mixed") => {
    const next = now !== true;
    session.elements.transform(movable.map((e) => (axis === "flipH" ? { id: e.id, flipH: next } : { id: e.id, flipV: next })));
  };

  const shown = (n: number | undefined) => (n === undefined ? "mixed" : round1(n));
  return (
    <PanelSection id="size" title="Size and rotation">
      <Cluster label="Position and size">
        <div className="ks-sp-grid">
          <NumberField label="X" unit="px" decimals={1} width={64} value={shown(around?.x)} disabled={off} onCommit={(v) => move("x", v)} />
          <NumberField label="Y" unit="px" decimals={1} width={64} value={shown(around?.y)} disabled={off} onCommit={(v) => move("y", v)} />
          <NumberField label="W" unit="px" decimals={1} width={64} min={least} value={shown(around?.w)} disabled={off} onCommit={(v) => size("w", v)} />
          <NumberField label="H" unit="px" decimals={1} width={64} min={least} value={shown(around?.h)} disabled={off} onCommit={(v) => size("h", v)} />
        </div>
      </Cluster>
      <Toggle label="Lock aspect ratio" on={lock} onChange={setLock} />
      <div className="ks-sp-inline">
        <NumberField label="Rotation" unit="°" decimals={1} width={56} min={-360} max={360} value={rotation} disabled={movable.length === 0} onCommit={turn} />
        <Cluster label="Flip" end>
          <IconButton icon="arrow-left-right" label="Flip horizontally" on={flipH === true} disabled={movable.length === 0} onClick={() => flip("flipH", flipH)} />
          <IconButton icon="arrow-up-down" label="Flip vertically" on={flipV === true} disabled={movable.length === 0} onClick={() => flip("flipV", flipV)} />
        </Cluster>
      </div>
    </PanelSection>
  );
}
