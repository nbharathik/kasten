// The parts of select all that are only the page's: which elements take typing, and selecting the text of a field or a region. Nothing
// here knows the editor, so the dialog can use it too.

/** A field that holds text a person types: an input of a text kind, or a text area. */
export function isTextField(element: Element | null): element is HTMLInputElement | HTMLTextAreaElement {
  if (element instanceof HTMLTextAreaElement) return true;
  return element instanceof HTMLInputElement && /^(text|search|url|tel|email|password|number|)$/.test(element.type);
}

/** Selects the text of a field, putting the focus in it first. */
export function selectFieldText(field: HTMLInputElement | HTMLTextAreaElement): void {
  field.focus({ preventScroll: true });
  field.select();
}

/** Selects everything a region holds. What cannot be selected (buttons, tabs, icons) stays out, as the stylesheet says. */
export function selectRegionText(region: Element): void {
  const selection = region.ownerDocument.defaultView?.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  const range = region.ownerDocument.createRange();
  range.selectNodeContents(region);
  selection.addRange(range);
}

/** Whether a key press is Ctrl+A (Cmd+A on a Mac), plain. */
export function isSelectAllKey(event: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">): boolean {
  return (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && (event.key.toLowerCase() === "a" || event.code === "KeyA");
}
