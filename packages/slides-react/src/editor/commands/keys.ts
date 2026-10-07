// Key combinations as text: "Mod+Shift+Z". `Mod` is Ctrl, or Cmd on a Mac.

export const isMac = (): boolean => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const NAMES: Record<string, string> = {
  " ": "Space",
  Escape: "Esc",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Delete: "Delete",
  Backspace: "Backspace",
  Enter: "Enter",
  Tab: "Tab",
};

/** The square brackets are named by their physical keys too: with Option held, a Mac types other characters on them. */
const BRACKETS: Record<string, string> = { BracketLeft: "[", BracketRight: "]" };

/** The combination an event stands for, in the same form the commands use. */
export function comboOf(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey" | "code">, mac = isMac()): string {
  const parts: string[] = [];
  if (mac ? event.metaKey : event.ctrlKey) parts.push("Mod");
  if (mac ? event.ctrlKey : event.metaKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  // A letter is named by its physical key, so Shift and layouts do not change it.
  const key = /^Key[A-Z]$/.test(event.code)
    ? event.code.slice(3)
    : /^Digit\d$/.test(event.code)
      ? event.code.slice(5)
      : event.code === "BracketLeft" || event.code === "BracketRight"
        ? (BRACKETS[event.code] ?? event.key)
        : (NAMES[event.key] ?? (event.key.length === 1 ? event.key.toUpperCase() : event.key));
  parts.push(key);
  return parts.join("+");
}

/** A combination as it is written on a menu: "Ctrl+B", or "⌘B" on a Mac. */
export function showCombo(combo: string, mac = isMac()): string {
  if (!mac) return combo.replaceAll("Mod", "Ctrl");
  return combo
    .split("+")
    .map((part) => ({ Mod: "⌘", Ctrl: "⌃", Alt: "⌥", Shift: "⇧", Up: "↑", Down: "↓", Left: "←", Right: "→", Backspace: "⌫", Enter: "↵" })[part] ?? part)
    .join("");
}
