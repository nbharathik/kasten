// What the side panel reads from the rendered page: headings for the outline
// and the words for the counts.

export interface Heading {
  level: number;
  text: string;
  element: HTMLElement;
}

/** Headings 1–3 of the page, in order. */
export function headingsIn(root: HTMLElement | null): Heading[] {
  if (!root) return [];
  return [...root.querySelectorAll<HTMLElement>(".ProseMirror h1, .ProseMirror h2, .ProseMirror h3")]
    .map((element) => ({ level: Number(element.tagName.slice(1)), text: element.textContent?.trim() ?? "", element }))
    .filter((h) => h.text);
}

export interface Counts {
  words: number;
  characters: number;
  /** Minutes at 230 words a minute, at least one for any text. */
  minutes: number;
}

export function countWords(text: string): Counts {
  const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu)?.length ?? 0;
  return { words, characters: text.replace(/\s/g, "").length, minutes: words ? Math.max(1, Math.round(words / 230)) : 0 };
}

/** The page's text as a reader sees it, without menus or placeholders. */
export function pageText(root: HTMLElement | null): string {
  const doc = root?.querySelector(".ProseMirror");
  if (!doc) return "";
  const parts: string[] = [];
  doc.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li, td, th, pre, summary").forEach((el) => {
    if (!el.querySelector("p, li, pre")) parts.push(el.textContent ?? "");
  });
  return parts.join("\n");
}
