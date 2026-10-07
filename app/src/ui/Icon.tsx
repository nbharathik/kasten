// An icon from the app's set (icons.ts), drawn in the current colour on a
// 24px grid. Decorative: the button or link around it carries the name.

import { createElement } from "react";
import { ICONS, type IconName } from "./icons";

export type { IconName };

const SIZED = /(^|\s)(size|w|h)-/;

export function Icon({ name, className = "", strokeWidth = 1.75 }: { name: IconName; className?: string; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${SIZED.test(className) ? "" : "size-[18px] "}shrink-0 ${className}`}
    >
      {ICONS[name].map(([tag, attributes], i) => createElement(tag, { key: i, ...attributes }))}
    </svg>
  );
}
