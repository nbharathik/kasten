// Equal spacing: dropping a box so the gaps in its row (or column) come out the same.

import type { Rect } from "./geometry.ts";
import type { Axis, Candidate, Guide } from "./guides.ts";
import { endOf, otherAxis, sizeOf, startOf } from "./guides.ts";

const EPS = 1e-9;

/** Three boxes in a line along the axis; one of them is the moving box, in the place it lands. */
type Chain = (placed: Rect) => [Rect, Rect, Rect];

/** The box that ends last but not after `limit`, ignoring `skip`. */
function lastEndingBy(boxes: readonly Rect[], axis: Axis, limit: number, skip?: Rect): Rect | undefined {
  let best: Rect | undefined;
  for (const box of boxes) {
    if (box === skip || endOf(box, axis) > limit) continue;
    if (!best || endOf(box, axis) > endOf(best, axis)) best = box;
  }
  return best;
}

/** The box that starts first but not before `limit`, ignoring `skip`. */
function firstStartingFrom(boxes: readonly Rect[], axis: Axis, limit: number, skip?: Rect): Rect | undefined {
  let best: Rect | undefined;
  for (const box of boxes) {
    if (box === skip || startOf(box, axis) < limit) continue;
    if (!best || startOf(box, axis) < startOf(best, axis)) best = box;
  }
  return best;
}

/** A marker across the gap between two boxes, halfway up the part of them that faces each other. */
function gapBetween(a: Rect, b: Rect, axis: Axis): Guide {
  const across = otherAxis(axis);
  const lo = Math.max(startOf(a, across), startOf(b, across));
  const hi = Math.min(endOf(a, across), endOf(b, across));
  const at = lo < hi ? (lo + hi) / 2 : (startOf(a, across) + endOf(a, across) + startOf(b, across) + endOf(b, across)) / 4;
  return { axis: across, at, from: endOf(a, axis), to: startOf(b, axis), kind: "spacing" };
}

/**
 * The ways `moving` can be placed along `axis` so its gap to a neighbour equals
 * another gap in the row: a gap that continues the row's rhythm on either side
 * of it, or one that centres it between the neighbours on both sides. Only
 * boxes level with the moving one (overlapping it across the axis) count.
 */
export function spacingCandidates(moving: Rect, targets: readonly Rect[], axis: Axis, threshold: number): Candidate[] {
  const across = otherAxis(axis);
  const level = targets.filter((t) => startOf(t, across) < endOf(moving, across) && endOf(t, across) > startOf(moving, across));
  const found: Candidate[] = [];
  const offer = (offset: number, chain: Chain): void => {
    if (Math.abs(offset) > threshold) return;
    found.push({
      offset,
      draw: (placed) => {
        const [a, b, c] = chain(placed);
        return [gapBetween(a, b, axis), gapBetween(b, c, axis)];
      },
    });
  };

  // The neighbour on each side may overlap the moving box by up to the threshold, as it will not once snapped.
  const before = lastEndingBy(level, axis, startOf(moving, axis) + threshold);
  const after = firstStartingFrom(level, axis, endOf(moving, axis) - threshold);
  const beforeThat = before && lastEndingBy(level, axis, startOf(before, axis), before);
  const afterThat = after && firstStartingFrom(level, axis, endOf(after, axis), after);

  if (before && beforeThat) {
    const gap = startOf(before, axis) - endOf(beforeThat, axis);
    if (gap > EPS) offer(endOf(before, axis) + gap - startOf(moving, axis), (placed) => [beforeThat, before, placed]);
  }
  if (after && afterThat) {
    const gap = startOf(afterThat, axis) - endOf(after, axis);
    if (gap > EPS) offer(startOf(after, axis) - gap - endOf(moving, axis), (placed) => [placed, after, afterThat]);
  }
  if (before && after && before !== after) {
    const room = startOf(after, axis) - endOf(before, axis) - sizeOf(moving, axis);
    if (room > EPS) offer(endOf(before, axis) + room / 2 - startOf(moving, axis), (placed) => [before, placed, after]);
  }
  return found;
}
