// Steps: what an element looks like at each click of a slide. An element's
// `stepStates` maps a step number to a state, and the state holds until the
// next change.

import type { Base, StepState } from "@kasten-slides/wasm";

const KNOWN: readonly StepState[] = ["hidden", "dimmed", "normal", "highlighted"];

/**
 * The state of an element at `step`: the entry of its `stepStates` with the
 * greatest step that is not after `step`, or `normal` when there is none.
 * The keys of `stepStates` are numbers written as JSON keys, so they are
 * strings here; one that is not a number is ignored, and a state this build
 * does not know (from a newer format) counts as `normal`.
 */
export function stateAt(element: { stepStates?: Base["stepStates"] }, step: number): StepState {
  const states = element.stepStates;
  if (!states) return "normal";
  let latest = Number.NEGATIVE_INFINITY;
  let state: StepState = "normal";
  for (const [key, value] of Object.entries(states)) {
    const at = key.trim() === "" ? Number.NaN : Number(key);
    if (!Number.isFinite(at) || at > step || at < latest) continue;
    latest = at;
    state = KNOWN.includes(value) ? value : "normal";
  }
  return state;
}
