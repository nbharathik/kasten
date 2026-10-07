// The few keys that edit the lines of a body as a list, so an outline can be
// written without typing the markers: Enter carries a list on to the next
// line, and on an empty item leaves the list; Tab and Shift+Tab move an empty
// item in and out a level. Every other key, and every other place, is left to
// the text field, which also keeps Tab free to leave the field.

/** The text of a field after an edit, and where the caret (or the selection) is. */
export interface LineEdit {
  value: string;
  start: number;
  end: number;
}

export interface KeyInfo {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

/** Indent, marker (`-`, `+`, `*`, `1.` or `1)`), the space after it, and the words. */
const ITEM = /^( *)([-+*]|\d+[.)])( +)(.*)$/;
const LEVEL = "  ";

/** The start and end of the line that holds `at`. */
function lineAt(value: string, at: number): { from: number; to: number } {
  const from = value.lastIndexOf("\n", at - 1) + 1;
  const end = value.indexOf("\n", at);
  return { from, to: end < 0 ? value.length : end };
}

/** The marker of the item after one with `marker`: the same bullet, or the next number. */
function markerAfter(marker: string): string {
  const number = /^(\d+)([.)])$/.exec(marker);
  return number ? `${Number(number[1]) + 1}${number[2]}` : marker;
}

function carryOn(value: string, start: number, end: number): LineEdit | null {
  if (start !== end) return null;
  const { from, to } = lineAt(value, start);
  const item = ITEM.exec(value.slice(from, to));
  if (!item) return null;
  const [, indent = "", marker = "", gap = "", words = ""] = item;
  // In the marker, Enter is an ordinary new line.
  if (start < from + indent.length + marker.length + gap.length) return null;
  if (words.trim() === "" && start === to) {
    // An empty item ends the list: one level out, or out altogether.
    const line = indent.length >= LEVEL.length ? `${indent.slice(LEVEL.length)}${marker}${gap}` : "";
    return { value: value.slice(0, from) + line + value.slice(to), start: from + line.length, end: from + line.length };
  }
  const added = `\n${indent}${markerAfter(marker)} `;
  const caret = start + added.length;
  return { value: value.slice(0, start) + added + value.slice(start), start: caret, end: caret };
}

function moveItem(value: string, start: number, end: number, out: boolean): LineEdit | null {
  if (start !== end) return null;
  const { from, to } = lineAt(value, start);
  const item = ITEM.exec(value.slice(from, to));
  if (!item || (item[4] ?? "").trim() !== "") return null;
  const indent = (item[1] ?? "").length;
  if (out) {
    if (indent < LEVEL.length) return null;
    return { value: value.slice(0, from) + value.slice(from + LEVEL.length), start: start - LEVEL.length, end: start - LEVEL.length };
  }
  // An item goes in one level under the one above it, no further.
  const above = from > 0 ? ITEM.exec(value.slice(lineAt(value, from - 1).from, from - 1)) : null;
  if (!above || indent + LEVEL.length > (above[1] ?? "").length + LEVEL.length) return null;
  return { value: value.slice(0, from) + LEVEL + value.slice(from), start: start + LEVEL.length, end: start + LEVEL.length };
}

/**
 * What a key does to the lines of a body: the new text and caret, or null
 * when the key is not one of these (or has nothing to do here) and the field
 * should treat it as it usually does.
 */
export function bodyLineEdit(key: KeyInfo, value: string, start: number, end: number): LineEdit | null {
  if (key.ctrlKey || key.metaKey || key.altKey) return null;
  if (key.key === "Enter" && !key.shiftKey) return carryOn(value, start, end);
  if (key.key === "Tab") return moveItem(value, start, end, key.shiftKey);
  return null;
}
