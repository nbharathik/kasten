/** Seconds an effect takes when the deck does not say. */
export const EFFECT_SECONDS: number;

/** Brings elements in with an effect: `none`, `fade`, `fadeUp` or `grow`. */
export function playEnter(elements: Iterable<Element>, effect: string | null | undefined, seconds?: number | null): void;

/** Remembers the elements a slide has drawn: each call answers which of `now` were not there the call before (the first call answers none). */
export function newcomers<T extends Element>(keyOf?: (element: T) => unknown): (now: readonly T[]) => T[];

/** Remembers which paragraphs were hidden: each call answers the ones that were hidden the call before and are not now (the first call answers none). */
export function uncovered<T extends HTMLElement>(keyOf?: (paragraph: T) => unknown): (paragraphs: readonly T[]) => T[];
