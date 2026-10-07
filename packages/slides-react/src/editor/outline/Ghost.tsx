import type { JSX, MouseEvent } from "react";

import { fieldOf, pressed } from "./select.ts";

/**
 * The words of a field again, as plain text laid over it. They are not seen (the field under them is), only selected: a press on them
 * starts a selection the browser can carry across the rows, and when the button is up `settle` decides whether it belongs to the field.
 * A field that has the focus is used directly, and its ghost lets the pointer through (outline.css).
 */
export function Ghost({ text, kind }: { text: string; kind: "title" | "body" }): JSX.Element {
  const press = (event: MouseEvent<HTMLElement>): void => {
    if (event.button === 0) pressed(event.currentTarget.closest<HTMLElement>(".ks-outline-view"));
    // The right button opens the browser's menu for whatever is under it: the field's (paste, spelling) once it has the focus.
    else if (event.button === 2) fieldOf(event.currentTarget)?.focus({ preventScroll: true });
  };
  return (
    <span className={`ks-ol-ghost is-${kind}`} aria-hidden="true" onMouseDown={press}>
      {text}
    </span>
  );
}
