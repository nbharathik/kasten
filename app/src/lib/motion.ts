// Motion: whether menus, dialogs and views move as they open and close.
// Settings offers System (follow the computer's "reduce motion"), On and
// Off. The result goes on <html> as `data-motion`, where the CSS reads it
// (styles.css sets every duration to nothing while it is off), and
// motionMs() gives scripted animations, such as a whiteboard's zoom, their
// length. Typing never animates, whatever the setting.

export type MotionPref = "system" | "on" | "off";
export const MOTION_PREFS: readonly MotionPref[] = ["system", "on", "off"];

const REDUCE = "(prefers-reduced-motion: reduce)";

function systemStill(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(REDUCE).matches;
}

/** Whether things move under `pref`. */
export function motionOn(pref: MotionPref): boolean {
  return pref === "on" || (pref === "system" && !systemStill());
}

/** Puts `pref`'s answer on the page. */
export function applyMotion(pref: MotionPref): void {
  document.documentElement.dataset.motion = motionOn(pref) ? "on" : "off";
}

/** `ms`, or no time at all while motion is off. */
export function motionMs(ms: number): number {
  return document.documentElement.dataset.motion === "off" ? 0 : ms;
}

/** Applies the setting again when the computer's own changes; returns the
 * way to stop listening. */
export function watchSystemMotion(pref: () => MotionPref): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(REDUCE);
  const changed = () => applyMotion(pref());
  query.addEventListener("change", changed);
  return () => query.removeEventListener("change", changed);
}

/** How a scroll the app starts moves: smoothly, or at once while motion is off. */
export function scrollMotion(): ScrollBehavior {
  return motionMs(1) ? "smooth" : "auto";
}
