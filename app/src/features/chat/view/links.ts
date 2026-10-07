// Where a chat opens what it links to. In the Chat view and the window's
// chat dock a link opens in place, as links do elsewhere (the dock stays
// beside it). Ctrl, Shift and Alt choose as everywhere (a tab, the side
// stack, a split).

import { createContext, useContext } from "react";

import { showSession } from "../../review/session-request";
import { useWorkspace, type OpenHow, type Place } from "../../workspace/store";

export type Variant = "full" | "dock";

/** A narrow chat beside other things: the dock. */
export const isNarrow = (variant: Variant) => variant === "dock";

export interface ChatLinks {
  variant: Variant;
  openTitle(title: string, how?: OpenHow): void;
  openPath(path: string, how?: OpenHow): void;
  go(place: Place): void;
  /** History, open on one agent session. */
  showSession(session: string): void;
}

export function linksFor(variant: Variant): ChatLinks {
  return {
    variant,
    openTitle: (title, how = "here") => void useWorkspace.getState().openTitle(title, how),
    openPath: (path, how = "here") => useWorkspace.getState().openPath(path, how),
    go: (place) => useWorkspace.getState().go(place),
    showSession: (session) => showSession(session),
  };
}

export const LinksContext = createContext<ChatLinks>(linksFor("full"));

export const useChatLinks = () => useContext(LinksContext);
