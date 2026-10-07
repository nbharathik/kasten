// Whether an element is drawn at all, and how.

import type { Element, StepState } from "@kasten-slides/wasm";

import type { SlideMode } from "./context.ts";
import { stateAt } from "./steps.ts";
import { isBlankText } from "./text-props.ts";

/**
 * The state an element is in. Without a step, steps are ignored and
 * everything is as it is styled. What a group hides, everything in it hides.
 */
export function stateOf(element: Element, step: number | undefined, groupHidden: boolean): StepState {
  if (groupHidden) return "hidden";
  return step === undefined ? "normal" : stateAt(element, step);
}

/**
 * Whether an element draws nothing in this mode. An empty slot on a layout
 * is a prompt for an editor only: to an audience, an empty placeholder is not
 * there. So is a picture with no file, and always the theme's own, which is
 * an empty place for the logo of a deck's owner to go.
 */
export function isUndrawn(element: Element, mode: SlideMode, master: boolean): boolean {
  switch (element.type) {
    case "text":
      return mode !== "edit" && element.placeholder != null && isBlankText(element.text);
    case "shape":
      return mode !== "edit" && element.placeholder != null && isBlankText(element.text);
    case "image":
      return element.src.trim() === "" && (mode !== "edit" || master);
    default:
      return false;
  }
}
