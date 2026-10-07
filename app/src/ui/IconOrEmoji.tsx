// Draws an icon string (glyph.ts): a line icon, sized to the text around it
// and muted like Notion's default page icon, or the person's own emoji.

import { Icon } from "./Icon";
import { lineIconName } from "./glyph";

const SIZED = /(^|\s)(size|w|h)-/;

export function IconOrEmoji({ icon, className = "" }: { icon: string; className?: string }) {
  const name = lineIconName(icon);
  if (name) return <Icon name={name} className={`${SIZED.test(className) ? "" : "size-[1.15em] "}kasten-glyph-line ${className}`} />;
  return (
    <span className={`kasten-glyph ${className}`} aria-hidden="true">
      {icon}
    </span>
  );
}
