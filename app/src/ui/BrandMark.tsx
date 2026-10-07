// The Kasten mark (docs/brand): a card box, two index cards fanned
// in a box with a label slot, as in "Zettelkasten", a box of cards. Drawn in
// the theme's colours, so it fits light and dark; `tile` sets it on a
// rounded square, as the app icon does. While Kasten works (a chat thinking,
// a brainstorm, an import) the cards rise out of the box and settle.

import { useId, type ReactNode } from "react";

// The same numbers as scripts/brand.mjs. Each shape cuts a gap into what is
// behind it, so the cards read as cards at any size.
const BOX = { x: 3, y: 12.2, width: 18, height: 8.8, rx: 2.6 };
const SLOT = { x: 9.4, y: 15.6, width: 5.2, height: 1.9, rx: 0.95 };
const LEFT = { x: 5.6, y: 3.8, width: 8.2, height: 11, rx: 1.7, transform: "rotate(-10 9.7 14.8)" };
const RIGHT = { x: 10.2, y: 3.8, width: 8.2, height: 11, rx: 1.7, transform: "rotate(10 14.3 14.8)" };
const GAP = 1.5;
const AREA = { maskUnits: "userSpaceOnUse", x: -2, y: -4, width: 28, height: 30 } as const;

interface BrandMarkProps {
  className?: string;
  /** On a rounded tile, in reverse, like the app icon. */
  tile?: boolean;
  /** The cards rise and settle: Kasten is working. */
  working?: boolean;
}

export function BrandMark({ className = "size-7", tile = false, working = false }: BrandMarkProps) {
  const id = useId().replace(/[^a-zA-Z0-9-]/g, "");
  const cut = { fill: "#000", stroke: "#000", strokeWidth: GAP * 2 };
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`kasten-mark${tile ? " is-tile" : ""}${working ? " is-working" : ""} ${className}`}
    >
      <defs>
        <mask id={`${id}-box`} {...AREA}>
          <rect x={-2} y={-4} width={28} height={30} fill="#fff" />
          <rect {...BOX} {...cut} />
        </mask>
        <mask id={`${id}-right`} {...AREA}>
          <rect x={-2} y={-4} width={28} height={30} fill="#fff" />
          <rect {...RIGHT} {...cut} />
        </mask>
        <mask id={`${id}-slot`} {...AREA}>
          <rect x={-2} y={-4} width={28} height={30} fill="#fff" />
          <rect {...SLOT} fill="#000" />
        </mask>
      </defs>
      {tile && <rect className="kasten-mark-tile" x="0" y="0" width="24" height="24" rx="5.4" />}
      {/* On the tile at 70 %, a touch high, since the box makes the bottom heavy. */}
      <g className="kasten-mark-symbol" transform={tile ? "translate(3.6 3.4) scale(0.7)" : undefined}>
        <g mask={`url(#${id}-box)`}>
          <g className="kasten-mark-cards">
            <g mask={`url(#${id}-right)`}>
              <rect {...LEFT} />
            </g>
            <rect {...RIGHT} />
          </g>
        </g>
        <g mask={`url(#${id}-slot)`}>
          <rect {...BOX} />
        </g>
      </g>
    </svg>
  );
}

/** Kasten at work: the moving mark and what it is doing, for assistive tech too. */
export function Working({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`kasten-working ${className}`} role="status">
      <BrandMark working className="size-[15px]" />
      <span>{children}</span>
    </span>
  );
}
