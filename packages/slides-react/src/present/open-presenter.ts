// The presenter's window in a browser: the same page opened again with `?presenter=<name>`, and a channel of that name between the two.
// The page then shows the presenter's view (`PresenterWindow`) instead of the editor.

import { PRESENTER_PARAM } from "./PresenterWindow.tsx";
import { type PresentSync, broadcastSync } from "./sync.ts";

/** Opens the presenter's window and returns the link to it; null when the browser would not open it. */
export function openBroadcastPresenter(): PresentSync | null {
  const name = Math.random().toString(36).slice(2, 10);
  const address = new URL(location.href);
  address.searchParams.set(PRESENTER_PARAM, name);
  // Width and height make it a window of its own, not a tab.
  const opened = window.open(address.href, "kasten-slides-presenter", "popup=yes,width=1180,height=780");
  if (!opened) return null;
  return broadcastSync(name);
}
