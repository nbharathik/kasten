import type { JSX, ReactNode } from "react";

interface UprightProps {
  flipH?: boolean;
  flipV?: boolean;
  children: ReactNode;
}

/**
 * Fills its parent and turns whatever is inside the right way up again when
 * the element is flipped. An element is flipped by mirroring its whole box, but
 * only its outline should be mirrored: words stay readable, as in PowerPoint.
 * Mirroring twice about the same centre puts things back.
 */
export function Upright({ flipH, flipV, children }: UprightProps): JSX.Element {
  const flipped = flipH || flipV;
  return (
    <div className="ks-fill" style={flipped ? { transform: `scale(${flipH ? -1 : 1}, ${flipV ? -1 : 1})` } : undefined}>
      {children}
    </div>
  );
}
