// Selecting words across the rows of the outline. Each row's title and body is a field, and the words of separate fields cannot be
// selected together, so every field has its words again as plain text laid over it (`Ghost`) while it is not the one being typed in.
// The browser selects across that text as it does across any page: a press and a drag, Shift and a click, the scrolling at the edge.
// What is done here is only the hand-over: a press that stays in one field is given to the field (its caret, its selection), and one
// that reaches another row is left as it is, a selection of the page's text that can be copied.

/** The plain text laid over a field. */
export const GHOST = ".ks-ol-ghost";

/** The ghost a node is inside, if it is inside one. */
export function ghostOf(node: Node | null): HTMLElement | null {
  const element = node instanceof Element ? node : (node?.parentElement ?? null);
  return element?.closest<HTMLElement>(GHOST) ?? null;
}

/** The field a ghost lies over. */
export function fieldOf(ghost: HTMLElement): HTMLInputElement | HTMLTextAreaElement | null {
  return ghost.parentElement?.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea") ?? null;
}

/** Where an end of a selection is in the words of a ghost, counting characters from 0. */
function place(ghost: HTMLElement, node: Node, offset: number): number {
  const length = ghost.textContent?.length ?? 0;
  // A boundary at the ghost itself counts its children: before the words, or after them.
  return node === ghost ? (offset === 0 ? 0 : length) : Math.min(offset, length);
}

/** Whether a selection was dragged from the right end back to the left. */
function backwards(selection: Selection): boolean {
  return selection.anchorNode !== null && selection.anchorNode === selection.focusNode && selection.anchorOffset > selection.focusOffset;
}

/**
 * The button is up after a press on a ghost. A selection that stayed inside one ghost (a click is one of no length) is handed to
 * its field, which takes the focus with the caret or the words selected as they were. One that reached another row is left as a
 * selection of the page's text, with the focus on the outline so its keys (Escape, Ctrl+A) reach it.
 */
export function settle(root: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  const from = ghostOf(range.startContainer);
  const to = ghostOf(range.endContainer);
  if (from && from === to) {
    const field = fieldOf(from);
    if (!field) return;
    const start = place(from, range.startContainer, range.startOffset);
    const end = place(from, range.endContainer, range.endOffset);
    const back = backwards(selection);
    selection.removeAllRanges();
    field.focus({ preventScroll: true });
    field.setSelectionRange(start, end, back ? "backward" : "forward");
  } else if (from || to) {
    holdFocus(root, selection);
  }
}

/** Gives the focus to the outline and keeps the selection as it is, ends and direction: some pages take a selection away with a focus. */
function holdFocus(root: HTMLElement, selection: Selection): void {
  const { anchorNode, anchorOffset, focusNode, focusOffset } = selection;
  root.focus({ preventScroll: true });
  if (anchorNode && focusNode) selection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);
}

/** Starts watching for the button to come up after a press on a ghost, once. */
export function pressed(root: HTMLElement | null): void {
  if (!root) return;
  const up = (): void => {
    document.removeEventListener("mouseup", up, true);
    settle(root);
  };
  document.addEventListener("mouseup", up, true);
}

/** Selects the words of every row, from the first field to the last. The field that has the focus lets go of it first (its words are written). */
export function selectAllText(root: HTMLElement): void {
  const ghosts = root.querySelectorAll<HTMLElement>(GHOST);
  const first = ghosts[0];
  const last = ghosts[ghosts.length - 1];
  const selection = window.getSelection();
  if (!first || !last || !selection) return;
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== root && root.contains(active)) active.blur();
  root.focus({ preventScroll: true });
  selection.setBaseAndExtent(first, 0, last, last.childNodes.length);
}

/**
 * The words of the fields that are in the selection, each as far as it is selected, one to a line: what a copy puts on the clipboard.
 * The browser's own copy of a selection across fields would put each field's value in twice, once as the field and once as its ghost.
 */
export function selectedWords(root: HTMLElement): string[] {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return [];
  const range = selection.getRangeAt(0);
  const lines: string[] = [];
  for (const ghost of root.querySelectorAll<HTMLElement>(GHOST)) {
    if (!range.intersectsNode(ghost)) continue;
    const part = document.createRange();
    part.selectNodeContents(ghost);
    if (part.compareBoundaryPoints(Range.START_TO_START, range) < 0) part.setStart(range.startContainer, range.startOffset);
    if (part.compareBoundaryPoints(Range.END_TO_END, range) > 0) part.setEnd(range.endContainer, range.endOffset);
    const words = part.toString();
    if (words !== "") lines.push(words);
  }
  return lines;
}

/** Whether some of the words of the rows are selected. */
export function hasSelectedWords(): boolean {
  const selection = window.getSelection();
  return !!selection && selection.rangeCount > 0 && !selection.isCollapsed && (ghostOf(selection.anchorNode) !== null || ghostOf(selection.focusNode) !== null);
}
