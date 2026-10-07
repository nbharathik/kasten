/** A pair of elements reveal.js is to animate between two slides, in the form its `autoAnimateMatcher` gives. */
export interface MorphPair {
  from: HTMLElement;
  to: HTMLElement;
  options: { translate: false; scale: false; styles: never[] };
}

/**
 * The pairs of elements between two slides, paired by `data-id`. Give it to reveal.js as `autoAnimateMatcher`; reveal.js is
 * told to animate nothing itself, and `animateMorph` does the animating.
 */
export function matchSlides(fromSlide: HTMLElement, toSlide: HTMLElement): MorphPair[];

/** Runs the morph between two slides; give it to reveal.js as the listener of "autoanimate". */
export function animateMorph(event: { fromSlide: HTMLElement; toSlide: HTMLElement }): void;
