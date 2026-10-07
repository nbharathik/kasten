// An icon as a string, for data that also carries emoji: the emoji or other
// character a person chose, or one of the app's line icons written
// "icon:name" (icons.ts). Glyph.tsx and icon-dom.ts draw either.

import { ICONS, type IconName } from "./icons";

const PREFIX = "icon:";

/** "icon:page" for the app's page icon. */
export const lineIcon = (name: IconName): string => PREFIX + name;

/** The line icon a value names, or null for an emoji or other text. */
export function lineIconName(value: string | null | undefined): IconName | null {
  if (!value?.startsWith(PREFIX)) return null;
  const name = value.slice(PREFIX.length);
  return Object.hasOwn(ICONS, name) ? (name as IconName) : null;
}
