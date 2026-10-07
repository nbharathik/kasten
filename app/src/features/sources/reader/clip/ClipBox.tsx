// The box drawn around a figure: an outline over the page with a handle on
// each corner and each side. Pressing inside it moves it, pressing a handle
// resizes it; the tool above takes it from there. It sits in its page, so it
// is placed by the page's own pixels and follows the page when the layout moves.

import type { PointerEvent, Ref } from "react";

import type { Box } from "../../pdf/geometry";
import { type Handle, HANDLES } from "./region";

/** Below this size (CSS pixels) the handles on the sides are left out: they would cover the box. */
const SMALL = 44;

interface Props {
  box: Box;
  ref?: Ref<HTMLDivElement>;
  onPress(event: PointerEvent, handle: Handle | null): void;
}

export function ClipBox({ box, ref, onPress }: Props) {
  const small = box.width < SMALL || box.height < SMALL;
  return (
    <div
      ref={ref}
      className={`kasten-clip-box${small ? " is-small" : ""}`}
      role="group"
      aria-label="Clip box"
      style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
      onPointerDown={(event) => onPress(event, null)}
      onPointerUp={(event) => event.stopPropagation()}
    >
      {HANDLES.map((handle) => (
        <span
          key={handle}
          className="kasten-clip-handle"
          data-handle={handle}
          onPointerDown={(event) => {
            event.stopPropagation();
            onPress(event, handle);
          }}
        />
      ))}
    </div>
  );
}
