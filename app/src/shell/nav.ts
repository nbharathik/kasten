import type { ViewId } from "../features/workspace/store";
import type { IconName } from "../ui/Icon";

export interface NavItem {
  id: ViewId;
  label: string;
  icon: IconName;
}

/** The sidebar's main modules, in order. */
export const PRIMARY_NAV: readonly NavItem[] = [
  { id: "inbox", label: "Inbox", icon: "inbox" },
  { id: "journal", label: "Journal", icon: "journal" },
  { id: "boards", label: "Whiteboards", icon: "board" },
  { id: "slides", label: "Slides", icon: "present" },
  { id: "library", label: "Card Library", icon: "library" },
  { id: "tags", label: "Tag Database", icon: "tag" },
  { id: "highlights", label: "Highlights", icon: "highlight" },
];

/** Shown after the modules only while agent proposals wait. */
export const REVIEW_NAV: NavItem = { id: "review", label: "Review", icon: "review" };

export const FOOTER_NAV: readonly NavItem[] = [
  { id: "history", label: "History", icon: "history" },
  { id: "trash", label: "Trash", icon: "trash" },
  { id: "import", label: "Import", icon: "import" },
  { id: "settings", label: "Settings", icon: "settings" },
];

/** The chat is the window's own (top right); its full view has no row. */
export const CHAT_NAV: NavItem = { id: "chat", label: "Chat", icon: "chat" };

/** Kasten's month and week grids of dated notes. */
export const CALENDAR_NAV: NavItem = { id: "calendar", label: "Calendar", icon: "calendar" };

const ALL = [...PRIMARY_NAV, REVIEW_NAV, CALENDAR_NAV, CHAT_NAV, ...FOOTER_NAV];

export function findNav(id: ViewId): NavItem | undefined {
  return ALL.find((n) => n.id === id);
}
