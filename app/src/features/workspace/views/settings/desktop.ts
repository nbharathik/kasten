// The desktop app's own choices: keep running in the tray, notifications,
// and the quick capture shortcut (app/src-tauri/src/desktop_prefs.rs and
// shortcut.rs).

import { invoke } from "@tauri-apps/api/core";

export interface DesktopPrefs {
  keepRunning: boolean;
  notifications: boolean;
  mac: boolean;
}

export interface CaptureShortcut {
  shortcut: string;
  label: string;
  /** This desktop takes no shortcut for every app. */
  wayland: boolean;
  /** What to bind in the desktop's own keyboard settings there. */
  command: string;
}

export const desktopPrefs = () => invoke<DesktopPrefs>("desktop_prefs");
export const setDesktopPrefs = (change: { keepRunning?: boolean; notifications?: boolean }) =>
  invoke<DesktopPrefs>("set_desktop_prefs", { keepRunning: change.keepRunning ?? null, notifications: change.notifications ?? null });
export const captureShortcut = () => invoke<CaptureShortcut>("capture_shortcut");
export const setCaptureShortcut = (shortcut: string | null) => invoke<CaptureShortcut>("set_capture_shortcut", { shortcut });

const MODIFIER_CODES = /^(Shift|Control|Alt|Meta|OS)(Left|Right)?$/;

/** A pressed key as a shortcut for the whole desktop, or null while only
 * modifiers are down or when none but Shift is: such a shortcut would
 * catch plain typing in every app. */
export function shortcutFrom(event: { code: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }, mac: boolean): string | null {
  if (!event.code || MODIFIER_CODES.test(event.code)) return null;
  const parts: string[] = [];
  if (mac ? event.metaKey : event.ctrlKey) parts.push("CmdOrCtrl");
  if (mac ? event.ctrlKey : event.metaKey) parts.push(mac ? "Ctrl" : "Super");
  if (event.altKey) parts.push("Alt");
  if (parts.length === 0) return null;
  if (event.shiftKey) parts.push("Shift");
  return [...parts, event.code].join("+");
}
