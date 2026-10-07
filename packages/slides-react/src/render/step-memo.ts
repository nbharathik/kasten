// A step changes how a few elements of a slide look and leaves the rest as they were. The views of elements
// skip drawing again when nothing they draw with has changed; the step is one of those things, and it is in
// what every element is drawn with, so without this every element of a slide would be drawn again at each step. An
// element whose look cannot have changed between two steps is left alone.

import type { Element } from "@kasten-slides/wasm";

import type { RenderCx } from "./context.ts";

const changePoints = new WeakMap<object, readonly number[]>();
const labelled = new WeakMap<object, boolean>();

/** The steps at which something about an element's look may change: the steps it names states for, and those its paragraphs come in at. */
function pointsOf(value: unknown, into: Set<number>): void {
  if (Array.isArray(value)) {
    for (const item of value) pointsOf(item, into);
  } else if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.stepStates && typeof record.stepStates === "object") {
      for (const key of Object.keys(record.stepStates)) {
        const at = Number(key);
        if (key.trim() !== "" && Number.isFinite(at)) into.add(at);
      }
    }
    if (typeof record.step === "number") into.add(record.step);
    for (const inner of Object.values(record)) if (inner !== null && typeof inner === "object") pointsOf(inner, into);
  }
}

/** Whether some run of the element says the step label, which is worded by the step. */
function hasStepLabel(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasStepLabel);
  if (value === null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.field === "stepLabel" || Object.values(record).some((inner) => inner !== null && typeof inner === "object" && hasStepLabel(inner));
}

function pointsFor(element: Element): readonly number[] {
  let found = changePoints.get(element);
  if (!found) {
    const set = new Set<number>();
    pointsOf(element, set);
    found = [...set];
    changePoints.set(element, found);
  }
  return found;
}

function saysStepLabel(element: Element): boolean {
  let found = labelled.get(element);
  if (found === undefined) {
    found = hasStepLabel(element);
    labelled.set(element, found);
  }
  return found;
}

/**
 * Whether an element is drawn the same with `a` as with `b` when the two differ in the step and in what follows from the step
 * (the words of the step label). False when anything else differs, and when the step could have changed how the element looks.
 */
export function sameApartFromStep(a: RenderCx, b: RenderCx, element: Element): boolean {
  if (
    a.theme !== b.theme ||
    a.layout !== b.layout ||
    a.mode !== b.mode ||
    a.imageUrl !== b.imageUrl ||
    a.paper !== b.paper ||
    a.master !== b.master ||
    a.size.w !== b.size.w ||
    a.size.h !== b.size.h ||
    a.fields.slideNumber !== b.fields.slideNumber ||
    a.fields.slideCount !== b.fields.slideCount
  ) {
    return false;
  }
  if (a.step === b.step) return a.fields.stepLabel === b.fields.stepLabel;
  if (a.step === undefined || b.step === undefined) return false;
  if (a.fields.stepLabel !== b.fields.stepLabel && saysStepLabel(element)) return false;
  const low = Math.min(a.step, b.step);
  const high = Math.max(a.step, b.step);
  return !pointsFor(element).some((at) => at > low && at <= high);
}
