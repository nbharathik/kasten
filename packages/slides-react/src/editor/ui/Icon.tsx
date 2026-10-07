import { createElement } from "react";

import { ICONS, type IconName } from "./icons.ts";

export type { IconName };

/** An icon from the editor's set, drawn in the current colour. Decorative: the button around it carries the name. */
export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="ks-icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name].map(([tag, attributes], i) => createElement(tag, { key: i, ...attributes }))}
    </svg>
  );
}
