// Full screen for presenting a whiteboard: the app's window in
// the desktop app, the page in a browser. Either may be refused, and what
// asks for it must look right without it.

import { getCurrentWindow } from "@tauri-apps/api/window";

import { inTauri } from "./api";

/** Fills the screen if it can. Resolves to what gives the screen back
 * (a no-op if this did not take it), and calls `onLeft` when the person
 * leaves full screen another way, as Esc does in a browser. */
export async function fillScreen(onLeft: () => void): Promise<() => void> {
  const none = () => {};
  if (inTauri()) {
    try {
      const win = getCurrentWindow();
      if (await win.isFullscreen()) return none;
      await win.setFullscreen(true);
      return () => void win.setFullscreen(false).catch(none);
    } catch {
      return none;
    }
  }
  const page = document.documentElement;
  if (typeof page.requestFullscreen !== "function" || document.fullscreenElement) return none;
  try {
    await page.requestFullscreen();
  } catch {
    return none;
  }
  const onChange = () => {
    if (document.fullscreenElement) return;
    document.removeEventListener("fullscreenchange", onChange);
    onLeft();
  };
  document.addEventListener("fullscreenchange", onChange);
  return () => {
    document.removeEventListener("fullscreenchange", onChange);
    if (document.fullscreenElement) void document.exitFullscreen().catch(none);
  };
}
